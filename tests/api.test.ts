import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { RecommendationIndex, ServiceGame } from "../src/domain/index-schema.js";
import { loadIndex } from "../src/service/index-store.js";
import type { LoadIndexResult } from "../src/service/index-store.js";
import { buildServer } from "../src/service/server.js";
import type { ServerDeps } from "../src/service/server.js";
import { loadServiceConfig } from "../src/service/service-config.js";
import { jsonFileText } from "../src/util/misc.js";

const config = loadServiceConfig();

const game = (id: string, over: Partial<ServiceGame> = {}): ServiceGame => ({
  id,
  title: `Game ${id}`,
  provider: `Studio ${id}`,
  gameType: "slot",
  seriesId: null,
  dedupeKey: `game${id}|studio${id}`,
  brands: ["aurora", "harbour", "meridian", "liberty"],
  markets: ["GB", "ES", "SE", "NL", "NJ"],
  status: "active",
  isTestGame: false,
  seasonMonths: null,
  insufficient: false,
  volatility: "medium",
  maxStake: 50,
  minStake: 0.2,
  mechanics: ["free_spins"],
  ...over,
});

/** A seed with five neighbours; f5 is a December-only title. */
const INDEX: RecommendationIndex = {
  schemaVersion: 2,
  indexVersion: "abcdef123456",
  builtAt: "2026-11-16T00:00:00.000Z",
  catalogueHash: "5caf2bbb0f343546",
  enrichment: { method: "rules", model: null, promptVersion: "rules.v1" },
  embedding: { id: "hashing-v1", dim: 512 },
  games: Object.fromEntries(
    [game("seed"), game("f1"), game("f2"), game("f3"), game("f4"), game("f5", { seasonMonths: [12] })].map((g) => [g.id, g]),
  ),
  neighbours: {
    seed: [["f5", 0.95], ["f1", 0.9], ["f2", 0.8], ["f3", 0.7], ["f4", 0.6]],
    f1: [["seed", 0.9]],
  },
};

const JULY = () => new Date("2026-07-15T12:00:00Z");
const app = (over: Partial<ServerDeps> = {}) => buildServer({ config, index: { ok: true, index: INDEX }, now: JULY, ...over });
const related = (q: string, gameId = "seed") => `/v1/games/${gameId}/related?${q}`;

const apps: Array<ReturnType<typeof app>> = [];
const fresh = (over: Partial<ServerDeps> = {}) => {
  const a = app(over);
  apps.push(a);
  return a;
};
afterAll(async () => {
  await Promise.all(apps.map((a) => a.close()));
});

describe("GET /v1/games/:gameId/related (spec 05 §6.2)", () => {
  it("AC2: an ok response has the stable shape, cacheable headers and x-index-version", async () => {
    const res = await fresh().inject({ url: related("brand=aurora&market=GB") });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body).sort()).toEqual(["brand", "gameId", "indexVersion", "items", "market", "seedTitle", "status"]);
    expect(body).toMatchObject({ gameId: "seed", seedTitle: "Game seed", brand: "aurora", market: "GB", indexVersion: "abcdef123456", status: "ok" });
    expect(body.items).toEqual([
      { gameId: "f1", title: "Game f1", score: 0.9 },
      { gameId: "f2", title: "Game f2", score: 0.8 },
      { gameId: "f3", title: "Game f3", score: 0.7 },
      { gameId: "f4", title: "Game f4", score: 0.6 },
    ]);
    expect(res.headers).toMatchObject({ "x-index-version": "abcdef123456", vary: "x-player-restricted", "cache-control": "public, max-age=300" });
    // No diagnostics or internal records leak into the response.
    expect(res.body).not.toMatch(/diagnostics|filtered|provenance|insufficient|seasonMonths/);
  });

  it("AC2: a restricted player gets private, no-store and a decline (header matched case-insensitively)", async () => {
    for (const value of ["true", "TRUE", "True"]) {
      const res = await fresh().inject({ url: related("brand=aurora&market=GB"), headers: { "x-player-restricted": value } });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ status: "declined", reason: "PLAYER_RESTRICTED", items: [] });
      expect(res.headers["cache-control"]).toBe("private, no-store");
    }
    const notRestricted = await fresh().inject({ url: related("brand=aurora&market=GB"), headers: { "x-player-restricted": "no" } });
    expect(notRestricted.json().status).toBe("ok");
  });

  it("AC2: an unknown game gets 404 with the same shape", async () => {
    const res = await fresh().inject({ url: related("brand=aurora&market=GB", "no-such-game") });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ gameId: "no-such-game", seedTitle: null, brand: "aurora", market: "GB", indexVersion: "abcdef123456", status: "declined", reason: "UNKNOWN_GAME", items: [] });
    expect(res.headers["x-index-version"]).toBe("abcdef123456");
  });

  it.each([
    ["a missing market", "brand=aurora", "invalid_request"],
    ["an unknown market", "brand=aurora&market=XX", "invalid_request"],
    ["a missing brand", "market=GB", "invalid_request"],
    ["limit=0", "brand=aurora&market=GB&limit=0", "invalid_request"],
    ["limit=51", "brand=aurora&market=GB&limit=51", "invalid_request"],
    ["a non-integer limit", "brand=aurora&market=GB&limit=2.5", "invalid_request"],
    ["an unknown brand", "brand=acme&market=GB", "unknown_brand"],
    ["a brand not offered in the market", "brand=liberty&market=GB", "brand_not_offered_in_market"],
  ])("AC2: 400 for %s", async (_label, q, error) => {
    const res = await fresh().inject({ url: related(q) });
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body).toMatchObject({ status: "error", error });
    expect(Object.keys(body).sort()).toEqual(error === "invalid_request" ? ["details", "error", "status"] : ["error", "status"]);
  });

  it("returns a disabled brand's decline as a 200, not an error", async () => {
    const res = await fresh().inject({ url: related("brand=meridian&market=GB") });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "declined", reason: "BRAND_DISABLED" });
  });

  it("clamps the limit to maxLimit and honours a smaller one", async () => {
    expect((await fresh().inject({ url: related("brand=aurora&market=GB&limit=1") })).json().items).toHaveLength(1);
    expect((await fresh().inject({ url: related("brand=aurora&market=GB&limit=50") })).json().items).toHaveLength(4);
  });

  it("decides seasonal availability from the injected clock", async () => {
    const december = await fresh({ now: () => new Date("2026-12-10T00:00:00Z") }).inject({ url: related("brand=aurora&market=GB") });
    expect(december.json().items[0].gameId).toBe("f5");
    const july = await fresh().inject({ url: related("brand=aurora&market=GB") });
    expect(july.json().items.map((i: { gameId: string }) => i.gameId)).not.toContain("f5");
  });
});

describe("with no index loaded", () => {
  const notLoaded: LoadIndexResult = { ok: false, error: "index not found at artifacts/index.json" };

  it("AC2: /ready is 503, /health is 200, and the API is 503", async () => {
    const a = fresh({ index: notLoaded });
    const ready = await a.inject({ url: "/ready" });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toEqual({ status: "not_ready", error: "index not found at artifacts/index.json" });
    const health = await a.inject({ url: "/health" });
    expect([health.statusCode, health.json()]).toEqual([200, { status: "ok" }]);
    const api = await a.inject({ url: related("brand=aurora&market=GB") });
    expect(api.statusCode).toBe(503);
    expect(api.json()).toEqual({ status: "unavailable", items: [] });
  });

  it("still answers a bad request with its 400 first", async () => {
    expect((await fresh({ index: notLoaded }).inject({ url: related("brand=aurora&market=XX") })).statusCode).toBe(400);
  });
});

describe("GET /ready and /metrics", () => {
  it("/ready describes the loaded index", async () => {
    const res = await fresh().inject({ url: "/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ready", indexVersion: "abcdef123456", embedding: INDEX.embedding, enrichment: INDEX.enrichment, games: 6 });
  });

  it("AC2: /metrics shows the request counter, the latency histogram and recs_index_info", async () => {
    const a = fresh();
    await a.inject({ url: related("brand=aurora&market=GB") });
    await a.inject({ url: related("brand=aurora&market=GB"), headers: { "x-player-restricted": "true" } });
    await a.inject({ url: related("brand=acme&market=GB") });
    await a.inject({ url: related("brand=aurora&market=GB", "nope") });
    const res = await a.inject({ url: "/metrics" });
    expect(res.headers["content-type"]).toMatch(/^text\/plain/);
    const text = res.body;
    expect(text).toContain('recs_requests_total{outcome="ok",reason="none",brand="aurora"} 1');
    expect(text).toContain('recs_requests_total{outcome="declined",reason="PLAYER_RESTRICTED",brand="aurora"} 1');
    expect(text).toContain('recs_requests_total{outcome="declined",reason="UNKNOWN_GAME",brand="aurora"} 1');
    // An unconfigured brand never becomes a label value.
    expect(text).toContain('recs_requests_total{outcome="invalid",reason="unknown_brand",brand="invalid"} 1');
    expect(text).not.toContain("acme");
    expect(text).toContain('recs_latency_ms_bucket{le="+Inf"} 4');
    expect(text).toContain("recs_latency_ms_count 4");
    expect(text).toMatch(/recs_latency_ms_bucket\{le="1"\} \d+/);
    expect(text).toContain('recs_index_info{version="abcdef123456"} 1');
  });

  it("counts 503s as unavailable, and has no index info when nothing is loaded", async () => {
    const a = fresh({ index: { ok: false, error: "x" } });
    await a.inject({ url: related("brand=aurora&market=GB") });
    const text = (await a.inject({ url: "/metrics" })).body;
    expect(text).toContain('recs_requests_total{outcome="unavailable",reason="index_not_loaded",brand="aurora"} 1');
    expect(text).not.toMatch(/recs_index_info\{/);
  });
});

describe("logging without player data (spec 05 §6.2, spec 07 §3.5)", () => {
  it("keeps request ids, logs the unrestricted recommendation, and logs no IP, port or restriction", async () => {
    const lines: string[] = [];
    const a = fresh({ logStream: { write: (line) => void lines.push(line) } });
    await a.inject({ url: related("brand=aurora&market=GB"), headers: { "x-request-id": "req-open-1" }, remoteAddress: "203.0.113.7" });
    await a.inject({ url: related("brand=aurora&market=GB"), headers: { "x-request-id": "req-second-2", "x-player-restricted": "true" }, remoteAddress: "203.0.113.8" });
    const log = lines.join("");
    expect(log).toContain("req-open-1");
    expect(log).toContain("req-second-2");

    const entries = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    const recs = entries.filter((e) => e.msg === "recommendation");
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ reqId: "req-open-1", gameId: "seed", brand: "aurora", market: "GB", outcome: "ok", reason: null, items: 4 });
    expect(recs[0]).toHaveProperty("filtered");
    expect(typeof recs[0]!.latencyMs).toBe("number");

    for (const forbidden of ["203.0.113", "remoteAddress", "remotePort", "restrict", "PLAYER_RESTRICTED"]) {
      expect(log).not.toContain(forbidden);
    }
    // The request serializer is exactly { id, method, url }.
    const incoming = entries.find((e) => e.msg === "incoming request");
    expect(Object.keys(incoming!.req as object).sort()).toEqual(["id", "method", "url"]);
  });
});

describe("loadIndex (spec 05 §5)", () => {
  const dir = mkdtempSync(join(tmpdir(), "index-store-"));
  const write = (name: string, text: string) => {
    const path = join(dir, name);
    writeFileSync(path, text, "utf8");
    return path;
  };
  const expectError = (r: LoadIndexResult, text: string) => {
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(text);
  };

  it("AC2: accepts a valid artefact", () => {
    const r = loadIndex(write("valid.json", jsonFileText(INDEX)), config);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.index.indexVersion).toBe("abcdef123456");
  });

  it("AC2: rejects missing, corrupt, wrong-schema-version and unknown-embedder artefacts without throwing", () => {
    expectError(loadIndex(join(dir, "missing.json"), config), "not found");
    expectError(loadIndex(write("corrupt.json", '{"schemaVersion": 2, "games": {'), config), "not valid JSON");
    expectError(loadIndex(write("v1.json", jsonFileText({ ...INDEX, schemaVersion: 1 })), config), "failed validation");
    expectError(loadIndex(write("embedder.json", jsonFileText({ ...INDEX, embedding: { id: "openai:text-embedding-3-large", dim: 3072 } })), config), "no score threshold");
  });

  it("rejects an index whose neighbours name a game it doesn't contain, or a bad game record", () => {
    expectError(loadIndex(write("dangling.json", jsonFileText({ ...INDEX, neighbours: { seed: [["ghost", 0.9]] } })), config), "failed validation");
    const badGame = { ...INDEX, games: { ...INDEX.games, f1: { ...INDEX.games.f1, status: "live" } } };
    expectError(loadIndex(write("bad-game.json", jsonFileText(badGame)), config), "failed validation");
    expectError(loadIndex(dir, config), "could not be read"); // a directory: an I/O error, still no throw
  });
});
