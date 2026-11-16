import OpenAI from "openai";

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
