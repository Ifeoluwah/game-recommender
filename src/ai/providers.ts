import OpenAI from "openai";
import { sha256 } from "../util/misc.js";

/**
 * Model providers. Used only at build time (generate and build-index scripts); the service must
 * never import this module (AGENTS.md rule 1, tests/boundaries.test.ts).
 */

export interface JsonLlm {
  /** e.g. "openai:gpt-4o-mini"; recorded in every artefact. */
  readonly id: string;
  completeJson(args: { system: string; user: string; schemaName: string; schema: object; temperature?: number }): Promise<unknown>;
}

/** Chat Completions with a strict JSON schema. The caller still validates the result with Zod. */
export class OpenAiJsonLlm implements JsonLlm {
  readonly id: string;
  private readonly model: string;
  private readonly client: OpenAI;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    this.model = opts.model ?? process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
    this.id = `openai:${this.model}`;
    this.client = new OpenAI({ apiKey: opts.apiKey ?? process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 2 });
  }

  async completeJson(args: { system: string; user: string; schemaName: string; schema: object; temperature?: number }): Promise<unknown> {
    const res = await this.client.chat.completions.create({
      model: this.model,
      // Repeatable by default; generation passes 0.7 explicitly.
      temperature: args.temperature ?? 0,
      messages: [
        { role: "system", content: args.system },
        { role: "user", content: args.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: args.schemaName, strict: true, schema: args.schema as Record<string, unknown> },
      },
    });
    const text = res.choices[0]?.message?.content;
    if (!text) throw new Error(`empty response from ${this.id}`);
    return JSON.parse(text) as unknown;
  }
}

// --- Embedders (spec 05 §3) ---

export interface Embedder {
  /** e.g. "openai:text-embedding-3-small"; the service picks its score threshold by this id. */
  readonly id: string;
  readonly dim: number;
  embed(texts: string[]): Promise<number[][]>;
}

/** The slice of the OpenAI client the embedder uses, so tests can check batching without a network. */
export interface EmbeddingsClient {
  embeddings: { create(args: { model: string; input: string[] }): Promise<{ data: Array<{ index: number; embedding: number[] }> }> };
}

export const EMBED_BATCH_SIZE = 100;

export class OpenAiEmbedder implements Embedder {
  readonly id: string;
  readonly dim: number;
  private readonly model: string;
  private readonly client: EmbeddingsClient;

  constructor(opts: { apiKey?: string; model?: string; client?: EmbeddingsClient } = {}) {
    this.model = opts.model ?? process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
    this.id = `openai:${this.model}`;
    this.dim = this.model.endsWith("-large") ? 3072 : 1536;
    this.client = opts.client ?? new OpenAI({ apiKey: opts.apiKey ?? process.env.OPENAI_API_KEY, timeout: 30_000, maxRetries: 2 });
  }

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let start = 0; start < texts.length; start += EMBED_BATCH_SIZE) {
      const batch = texts.slice(start, start + EMBED_BATCH_SIZE);
      const res = await this.client.embeddings.create({ model: this.model, input: batch });
      // The API returns an index per item; don't rely on response order.
      const byIndex = [...res.data].sort((a, b) => a.index - b.index);
      if (byIndex.length !== batch.length) throw new Error(`${this.id} returned ${byIndex.length} embeddings for ${batch.length} texts`);
      for (const d of byIndex) {
        if (d.embedding.length !== this.dim) throw new Error(`${this.id} returned dimension ${d.embedding.length}, expected ${this.dim}`);
        out.push(d.embedding);
      }
    }
    return out;
  }
}

/** Spec 05 §3. */
export const STOPWORDS = new Set(
  "a an and the of in on to for with by at from is are it its this that your you into as be or game games".split(" "),
);

/** Appendix A17 verbatim: a deterministic, keyless stand-in. Never the shipped configuration. */
export class HashingEmbedder implements Embedder {
  readonly id = "hashing-v1";
  readonly dim = 512;
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }
  private embedOne(text: string): number[] {
    const v = new Array<number>(this.dim).fill(0);
    const tokens = text.toLowerCase().replace(/[^a-z0-9_ ]+/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOPWORDS.has(w));
    for (const tok of tokens) {
      const h = sha256(tok);
      const idx = parseInt(h.slice(0, 8), 16) % this.dim;
      const sign = parseInt(h.slice(8, 10), 16) % 2 === 0 ? 1 : -1;
      const weight = tok.includes("_") || /^(slot|table|live|bingo|low|medium|high)$/.test(tok) ? 2 : 1;
      v[idx] = (v[idx] as number) + sign * weight;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }
}

export type ProviderMode = "openai" | "offline";

/**
 * `--provider=openai|offline`. Without the flag: openai when OPENAI_API_KEY is set, else offline.
 * The reason is returned so scripts can say which one they picked and why.
 */
export function resolveProviderMode(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): { mode: ProviderMode; reason: string } {
  const flag = argv.find((a) => a.startsWith("--provider="));
  if (flag) {
    const value = flag.slice("--provider=".length);
    if (value !== "openai" && value !== "offline") throw new Error(`unknown --provider value "${value}" (expected openai or offline)`);
    return { mode: value, reason: "from --provider" };
  }
  return env.OPENAI_API_KEY
    ? { mode: "openai", reason: "no --provider flag and OPENAI_API_KEY is set" }
    : { mode: "offline", reason: "no --provider flag and no OPENAI_API_KEY" };
}
