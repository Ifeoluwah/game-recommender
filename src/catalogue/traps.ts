import type { CanonicalGame } from "../domain/types.js";
import type { Market, Mechanic } from "../domain/vocabulary.js";
import { sampleN, seededRandom } from "../util/misc.js";
import type { Special } from "./degrade.js";

/**
 * Guardrail traps (spec 02 §4.1, appendix A8). Each trap is a near-copy of a real game ("anchor"), so
 * it ranks at or near the top by similarity alone; only the right guardrail can stop it.
 */
export function addTrapGames(canonical: CanonicalGame[], seed = 777): { canonical: CanonicalGame[]; specials: Map<string, Special>; anchors: Set<string>; anchorOf: Map<string, string> } {
  const rand = seededRandom(seed);
  const games = canonical.map((g) => ({ ...g }));
  const specials = new Map<string, Special>();
  let next = Math.max(...games.map((g) => Number(g.id.slice(2)))) + 1;
  const newId = () => `g-${String(next++).padStart(3, "0")}`;
  // Prefer well-described live slots as anchors; fall back to any live standalone slot.
  const liveSlots = games.filter((g) => g.status === "active" && g.gameType === "slot" && !g.seriesId && !g.benchmarkCluster);
  const described = liveSlots.filter((g) => g.description.length > 40);
  const candidates = described.length >= 7 ? described : liveSlots;
  if (candidates.length < 7) throw new Error(`need at least 7 live standalone slots to derive trap games, found ${candidates.length}`);
  const [marketSeeds, escalationSeeds, lifecycleSeeds] = (() => {
    const picked = sampleN(rand, candidates.map((g) => g.id), 7);
    return [picked.slice(0, 2), picked.slice(2, 4), picked.slice(4, 7)];
  })();
  const byId = (id: string) => games.find((g) => g.id === id)!;
  const extra: CanonicalGame[] = [];
  const anchorOf = new Map<string, string>();

  for (const id of marketSeeds) {
    const g = byId(id);
    // The original is certified in NJ and carried by the NJ brand...
    g.brands = [...new Set([...g.brands, "liberty"])].sort();
    g.markets = [...new Set<Market>([...g.markets, "GB", "NJ"])].sort() as Market[];
    // ...its near-twin is carried by the same brands but only certified in Europe.
    const twin: CanonicalGame = { ...g, id: newId(), title: `${g.title} II`, markets: g.markets.filter((m) => m !== "NJ") as Market[], seriesId: `${g.id}-family` };
    g.seriesId = `${g.id}-family`;
    extra.push(twin);
    specials.set(twin.id, "market_twin");
    anchorOf.set(twin.id, g.id);
  }

  for (const id of escalationSeeds) {
    const g = byId(id);
    // Make the original a gentle, casual game...
    Object.assign(g, { volatility: "low", minStake: 0.1, maxStake: 5, maxWinMultiplier: Math.min(g.maxWinMultiplier, 1000), markets: [...new Set<Market>([...g.markets, "GB", "ES"])].sort() });
    // ...and plant a high-risk game that looks almost the same to an embedding.
    const twin: CanonicalGame = {
      ...g,
      id: newId(),
      title: `${g.title} Xtreme`,
      volatility: "extreme",
      mechanics: [...new Set<Mechanic>([...g.mechanics, "bonus_buy"])],
      minStake: 2,
      maxStake: 500,
      maxWinMultiplier: 50000,
      description: `${g.description} Extreme volatility with Bonus Buy to jump straight into the feature.`,
      seriesId: null,
    };
    extra.push(twin);
    specials.set(twin.id, "escalation_twin");
    anchorOf.set(twin.id, g.id);
  }

  const lifecycle: Array<[CanonicalGame["status"], string, Special]> = [
    ["suspended", "Deluxe", "lifecycle_suspended"],
    ["certification_expired", "Classic", "lifecycle_cert_expired"],
    ["demo_only", "Demo", "lifecycle_demo_only"],
  ];
  lifecycleSeeds.forEach((id, i) => {
    const g = byId(id);
    const [status, suffix, special] = lifecycle[i]!;
    const clone: CanonicalGame = { ...g, id: newId(), title: `${g.title} ${suffix}`, status, seriesId: null, benchmarkCluster: null, clusterRole: null };
    extra.push(clone);
    specials.set(clone.id, special);
    anchorOf.set(clone.id, g.id);
  });

  const popular = byId(lifecycleSeeds[0]!);
  const testGame: CanonicalGame = {
    ...popular,
    id: newId(),
    title: `TEST_${popular.title.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_V2`,
    isTestGame: true,
    status: "active", // the feed says it's live; only the test flag/name stops it
    seriesId: null,
  };
  extra.push(testGame);
  specials.set(testGame.id, "test_game");
  anchorOf.set(testGame.id, popular.id);

  // Anchors (the originals the traps imitate) stay clean, so each trap tests one thing.
  const anchors = new Set([...marketSeeds, ...escalationSeeds, ...lifecycleSeeds]);
  return { canonical: [...games, ...extra], specials, anchors, anchorOf };
}
