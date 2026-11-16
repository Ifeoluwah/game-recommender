import { describe, expect, it } from "vitest";
import { EMBED_BATCH_SIZE, HashingEmbedder, OpenAiEmbedder, resolveProviderMode } from "../src/ai/providers.js";
import type { EmbeddingsClient } from "../src/ai/providers.js";
import { buildModeToRead } from "../src/config.js";

describe("resolveProviderMode", () => {
  it("honours the flag, key or not", () => {
    expect(resolveProviderMode(["--provider=offline"], { OPENAI_API_KEY: "sk-test" }).mode).toBe("offline");
    expect(resolveProviderMode(["--provider=openai"], {}).mode).toBe("openai");
  });

  it("without the flag, picks openai only when a key is set, and says why", () => {
    expect(resolveProviderMode([], { OPENAI_API_KEY: "sk-test" })).toEqual({ mode: "openai", reason: expect.stringMatching(/OPENAI_API_KEY is set/) });
    expect(resolveProviderMode([], {})).toEqual({ mode: "offline", reason: expect.stringMatching(/no OPENAI_API_KEY/) });
  });

  it("rejects unknown values", () => {
    expect(() => resolveProviderMode(["--provider=bedrock"], {})).toThrow(/unknown --provider value/);
  });
});

describe("buildModeToRead (demo and eval)", () => {
  it("reads the OpenAI build unless told offline, whatever the environment", () => {
    expect(buildModeToRead([])).toBe("openai");
    expect(buildModeToRead(["--provider=offline"])).toBe("offline");
    expect(() => buildModeToRead(["--provider=local"])).toThrow(/unknown --provider value/);
  });
});

describe("HashingEmbedder (appendix A17)", () => {
  const embedder = new HashingEmbedder();
  const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

  it("is hashing-v1, 512-dimensional, deterministic and unit-length", async () => {
    expect([embedder.id, embedder.dim]).toEqual(["hashing-v1", 512]);
    const [a, b] = await embedder.embed(["Title: Coral Cove. Type: slot.", "Title: Coral Cove. Type: slot."]);
    expect(a).toHaveLength(512);
    expect(a).toEqual(b);
    expect(norm(a!)).toBeCloseTo(1, 10);
  });

  it("ignores case, punctuation, one-character tokens and stopwords", async () => {
    const [a, b, empty] = await embedder.embed(["Coral COVE!", "the coral, a cove (x)", "the game of a"]);
    expect(a).toEqual(b);
    expect(empty!.every((x) => x === 0)).toBe(true); // nothing left to hash: the zero vector, not NaN
  });

  it("weights vocabulary-style tokens double", async () => {
    const [plain, weighted] = await embedder.embed(["fishing", "free_spins"]);
    expect(Math.max(...plain!.map(Math.abs))).toBe(1);
    expect(Math.max(...weighted!.map(Math.abs))).toBe(1); // a single token normalises to ±1 either way
    const [mixed] = await embedder.embed(["fishing free_spins"]);
    expect(mixed!.filter((x) => x !== 0).map(Math.abs).sort()).toEqual([1 / Math.sqrt(5), 2 / Math.sqrt(5)]);
  });
});

describe("OpenAiEmbedder", () => {
  /** A fake client that returns each batch shuffled, with each vector encoding its text's position. */
  const fakeClient = (dim: number) => {
    const calls: string[][] = [];
    const client: EmbeddingsClient = {
      embeddings: {
        create: async ({ input }) => {
          calls.push(input);
          const data = input.map((text, index) => ({ index, embedding: Array.from({ length: dim }, (_, d) => (d === 0 ? Number(text) : 0)) }));
          return { data: data.reverse() };
        },
      },
    };
    return { client, calls };
  };

  it("batches by 100 and puts results back in input order", async () => {
    const { client, calls } = fakeClient(1536);
    const embedder = new OpenAiEmbedder({ model: "text-embedding-3-small", client });
    const texts = Array.from({ length: 250 }, (_, i) => String(i));
    const vectors = await embedder.embed(texts);
    expect(EMBED_BATCH_SIZE).toBe(100);
    expect(calls.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(vectors.map((v) => v[0])).toEqual(texts.map(Number));
  });

  it("names itself after the model, with 3072 dimensions for -large", () => {
    const { client } = fakeClient(1);
    expect(new OpenAiEmbedder({ model: "text-embedding-3-small", client })).toMatchObject({ id: "openai:text-embedding-3-small", dim: 1536 });
    expect(new OpenAiEmbedder({ model: "text-embedding-3-large", client })).toMatchObject({ id: "openai:text-embedding-3-large", dim: 3072 });
  });

  it("refuses a wrong dimension", async () => {
    const { client } = fakeClient(8);
    await expect(new OpenAiEmbedder({ model: "text-embedding-3-small", client }).embed(["1"])).rejects.toThrow(/dimension 8/);
  });
});
