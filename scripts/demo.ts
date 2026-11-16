import { existsSync } from "node:fs";
import { artifactPaths, buildCommand, buildModeToRead } from "../src/config.js";
import type { RecommendationIndex } from "../src/domain/index-schema.js";
import { loadIndex } from "../src/service/index-store.js";
import { recommend } from "../src/service/recommender.js";
import { buildServer } from "../src/service/server.js";
import { loadServiceConfig } from "../src/service/service-config.js";

// npm run demo [-- --provider=offline]
// Every path through the service, in-process with app.inject. Reads the committed OpenAI build unless
// told otherwise, and never falls back to the other build (spec 05 §3, §8).

const mode = buildModeToRead(process.argv.slice(2));
const paths = artifactPaths(mode);
for (const file of [paths.index, paths.enrichedCatalogue]) {
  if (!existsSync(file)) {
    console.error(`No ${mode} build: ${file} is missing. Create it with: ${buildCommand(mode)}`);
    if (mode === "openai") console.error("To see the demo on the keyless stand-in instead: npm run demo -- --provider=offline");
    process.exit(1);
  }
}

const config = loadServiceConfig();
const loaded = loadIndex(paths.index, config);
if (!loaded.ok) {
  console.error(`The ${mode} index didn't load: ${loaded.error}`);
  process.exit(1);
}
const index: RecommendationIndex = loaded.index;

// A fixed clock, so seasonal rules (and so the picks) don't depend on the day the demo runs.
const DEMO_DATE = new Date("2026-07-15T12:00:00Z");
const month = DEMO_DATE.getUTCMonth() + 1;
const app = buildServer({ config, index: loaded, now: () => DEMO_DATE });

// Deterministic picks: scan the index in id order.
const ids = Object.keys(index.games).sort();
const okOn = (gameId: string, brand: string, market: "GB" | "NJ") => recommend(index, config, { gameId, brand, market, month }).status === "ok";
const pick = (what: string, test: (id: string) => boolean): string => {
  const id = ids.find(test);
  if (!id) throw new Error(`no game in this build for: ${what}`);
  return id;
};
const normal = pick("ok on aurora/GB and harbour/GB", (id) => okOn(id, "aurora", "GB") && okOn(id, "harbour", "GB"));
const nj = pick("ok on liberty/NJ", (id) => okOn(id, "liberty", "NJ"));
// The first insufficient game that passes the seed checks on aurora/GB. The first insufficient game
// overall may be unlicensed in GB, and the seed-availability check (which runs first) would answer.
const thin = pick("flagged insufficient and available on aurora/GB", (id) => {
  const g = index.games[id]!;
  return g.insufficient && g.markets.includes("GB") && !g.isTestGame;
});
const unlicensed = pick("not licensed in GB", (id) => !index.games[id]!.markets.includes("GB"));

interface Case { title: string; expect: string; url: string; headers?: Record<string, string> }
const related = (gameId: string, brand: string, market: string) => `/v1/games/${encodeURIComponent(gameId)}/related?brand=${brand}&market=${market}`;
const cases: Case[] = [
  { title: "Normal: a well-described seed", expect: "200 ok", url: related(normal, "aurora", "GB") },
  { title: "The same game on another brand", expect: "200 ok", url: related(normal, "harbour", "GB") },
  { title: "An NJ player on liberty", expect: "200 ok", url: related(nj, "liberty", "NJ") },
  { title: "A thin seed", expect: "200 declined INSUFFICIENT_SOURCE_DATA", url: related(thin, "aurora", "GB") },
  { title: "A seed not licensed in the market", expect: "200 declined SEED_NOT_AVAILABLE", url: related(unlicensed, "aurora", "GB") },
  { title: "A restricted player", expect: "200 declined PLAYER_RESTRICTED (private, no-store)", url: related(normal, "aurora", "GB"), headers: { "x-player-restricted": "true" } },
  { title: "A disabled brand", expect: "200 declined BRAND_DISABLED", url: related(normal, "meridian", "GB") },
  { title: "An unknown game", expect: "404 declined UNKNOWN_GAME", url: related("no-such-game", "aurora", "GB") },
  { title: "An invalid market", expect: "400 invalid_request", url: related(normal, "aurora", "XX") },
  { title: "A brand not offered in the market", expect: "400 brand_not_offered_in_market", url: related(normal, "liberty", "GB") },
];

console.log(`Demo on the ${mode} build: index ${index.indexVersion}, embedder ${index.embedding.id}, ${ids.length} games, clock ${DEMO_DATE.toISOString().slice(0, 10)}`);
if (mode === "offline") console.log("(Offline stand-in: keyless rules enrichment and hashing embedder. Not the shipped build.)");

for (const [i, c] of cases.entries()) {
  const res = await app.inject({ method: "GET", url: c.url, headers: c.headers });
  const body = res.json() as { status: string; reason?: string; error?: string; seedTitle?: string | null; items?: Array<{ gameId: string; title: string; score: number }> };
  const outcome = [res.statusCode, body.status, body.reason ?? body.error ?? ""].filter((x) => x !== "").join(" ");
  console.log(`\n${i + 1}. ${c.title}`);
  console.log(`   GET ${c.url}${c.headers ? `  (${Object.entries(c.headers).map(([k, v]) => `${k}: ${v}`).join(", ")})` : ""}`);
  if (body.seedTitle) console.log(`   seed: ${body.seedTitle}`);
  console.log(`   → ${outcome}   [expected ${c.expect}]   cache-control: ${res.headers["cache-control"] ?? "-"}`);
  for (const item of body.items ?? []) console.log(`     ${item.score.toFixed(4)}  ${item.gameId}  ${item.title}`);
}

await app.close();
