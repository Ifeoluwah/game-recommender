import { describe, expect, it } from "vitest";
import type { ServiceGame } from "../src/domain/index-schema.js";
import { DECLINE_REASONS, clampLimit, recommend } from "../src/service/recommender.js";
import type { DeclineReason, RecommendIndex, RecommendRequest, RecommendResult } from "../src/service/recommender.js";
import { loadServiceConfig } from "../src/service/service-config.js";

const config = loadServiceConfig();

/** A well-behaved candidate: live, on every brand, licensed everywhere, medium volatility, £0.20–£10. */
const game = (id: string, over: Partial<ServiceGame> = {}): ServiceGame => ({
  id,
  title: `Game ${id}`,
  provider: `Studio ${id}`,
  gameType: "slot",
  seriesId: null,
  dedupeKey: `${id}|studio`,
  brands: ["aurora", "harbour", "liberty"],
  markets: ["GB", "ES", "SE", "NL", "NJ"],
  status: "active",
  isTestGame: false,
  seasonMonths: null,
  insufficient: false,
  volatility: "medium",
  maxStake: 10,
  minStake: 0.2,
  mechanics: ["free_spins"],
  themes: ["fruit"],
  ...over,
});

const SEED = game("seed");
const fillers = (n = 3) => Array.from({ length: n }, (_, i) => game(`f${i + 1}`));

/** The seed's neighbours are `candidates`, in order, scored 0.95, 0.94, … unless scores are given. */
function indexWith(candidates: ServiceGame[], seed: ServiceGame = SEED, scores?: number[]): RecommendIndex {
  return {
    embedding: { id: "hashing-v1", dim: 512 },
    games: Object.fromEntries([seed, ...candidates].map((g) => [g.id, g])),
    neighbours: { [seed.id]: candidates.map((g, i) => [g.id, scores?.[i] ?? Number((0.95 - i * 0.01).toFixed(4))]) },
  };
}

const ask = (index: RecommendIndex, over: Partial<RecommendRequest> = {}): RecommendResult =>
  recommend(index, config, { gameId: "seed", brand: "aurora", market: "GB", month: 7, limit: 12, ...over });
const shown = (r: RecommendResult) => r.items.map((i) => i.gameId);

/** The trap sits at similarity rank #1, with enough good games behind it to make a rail. */
const withTrapFirst = (trap: ServiceGame, over: Partial<RecommendRequest> = {}, seed: ServiceGame = SEED) => ask(indexWith([trap, ...fillers()], seed), over);

describe("layer 2: eligibility, even at similarity rank #1", () => {
  it.each<[string, Partial<ServiceGame>, string]>([
    ["a test build", { isTestGame: true }, "eligibility:test_game"],
    ["an out-of-season title", { seasonMonths: [1, 11, 12] }, "eligibility:out_of_season"],
    ["a bonus-buy game in GB", { mechanics: ["free_spins", "bonus_buy"] }, "eligibility:feature_restricted_in_market"],
    ["a game not licensed in the market", { markets: ["ES", "SE"] }, "eligibility:not_licensed_in_market"],
    ["a game that isn't live", { status: "withdrawn" }, "eligibility:not_live"],
    ["a game not on the brand", { brands: ["harbour"] }, "eligibility:not_on_brand"],
    ["a game with an unreadable season", { seasonMonths: [] }, "eligibility:out_of_season"],
  ])("never shows %s", (_label, over, rule) => {
    const r = withTrapFirst(game("trap", over));
    expect(r.status).toBe("ok");
    expect(shown(r)).toEqual(["f1", "f2", "f3"]);
    expect(r.diagnostics[rule]).toBe(1);
  });

  it("shows a seasonal title in season", () => {
    const r = withTrapFirst(game("festive", { seasonMonths: [1, 11, 12] }), { month: 12 });
    expect(shown(r)[0]).toBe("festive");
  });

  it("never shows an unreadable-season title, in any month", () => {
    for (const month of [1, 7, 12]) expect(shown(withTrapFirst(game("x", { seasonMonths: [] }), { month }))).not.toContain("x");
  });

  it("shows a bonus-buy game outside GB", () => {
    const r = withTrapFirst(game("bb", { mechanics: ["bonus_buy"] }), { market: "ES" });
    expect(shown(r)[0]).toBe("bb");
  });

  it("counts every eligibility problem of a candidate, once each", () => {
    const r = withTrapFirst(game("trap", { isTestGame: true, markets: ["ES"], status: "withdrawn" }));
    expect(r.diagnostics).toMatchObject({ "eligibility:test_game": 1, "eligibility:not_licensed_in_market": 1, "eligibility:not_live": 1 });
  });
});

describe("layer 3: policy", () => {
  const low = game("seed", { volatility: "low" });

  it("allows one volatility step up and blocks two", () => {
    expect(shown(withTrapFirst(game("up1", { volatility: "medium" }), {}, low))[0]).toBe("up1");
    const r = withTrapFirst(game("up2", { volatility: "high" }), {}, low);
    expect(shown(r)).not.toContain("up2");
    expect(r.diagnostics["policy:volatility_escalation"]).toBe(1);

    const medium = game("seed", { volatility: "medium" });
    expect(shown(withTrapFirst(game("up1", { volatility: "high" }), {}, medium))[0]).toBe("up1");
    expect(shown(withTrapFirst(game("up2", { volatility: "extreme" }), {}, medium))).not.toContain("up2");
  });

  it("fails closed on unknown volatility, both ways", () => {
    // Unknown candidate, low seed: blocked.
    const r1 = withTrapFirst(game("unknown", { volatility: null }), {}, low);
    expect(shown(r1)).not.toContain("unknown");
    expect(r1.diagnostics["policy:volatility_unknown"]).toBe(1);
    // Unknown seed is treated as low: a high candidate is two steps up and blocked, a medium one is allowed.
    const unknownSeed = game("seed", { volatility: null });
    expect(shown(withTrapFirst(game("high", { volatility: "high" }), {}, unknownSeed))).not.toContain("high");
    expect(shown(withTrapFirst(game("medium", { volatility: "medium" }), {}, unknownSeed))[0]).toBe("medium");
    // Only a cap that already admits extreme lets an unknown candidate through.
    const highSeed = game("seed", { volatility: "high" });
    expect(shown(withTrapFirst(game("unknown", { volatility: null }), {}, highSeed))[0]).toBe("unknown");
  });

  it("blocks a max bet of £5 → £500 and a min bet of 10p → £2", () => {
    const seed = game("seed", { maxStake: 5, minStake: 0.1 });
    const maxJump = withTrapFirst(game("max", { maxStake: 500 }), {}, seed);
    expect(shown(maxJump)).not.toContain("max");
    expect(maxJump.diagnostics["policy:stake_escalation"]).toBe(1);
    const minJump = withTrapFirst(game("min", { minStake: 2 }), {}, seed);
    expect(shown(minJump)).not.toContain("min");
    expect(minJump.diagnostics["policy:min_bet_escalation"]).toBe(1);
    // Exactly 5× and 10× are allowed.
    expect(shown(withTrapFirst(game("edge", { maxStake: 25, minStake: 1 }), {}, seed))[0]).toBe("edge");
  });

  it("fails closed on unknown stakes", () => {
    const r = withTrapFirst(game("nostake", { maxStake: null }));
    expect(shown(r)).not.toContain("nostake");
    expect(r.diagnostics["policy:stake_unknown"]).toBe(1);
    // A seed with unknown stakes is the most cautious player: max £2, min £0.10.
    const seed = game("seed", { maxStake: null, minStake: null });
    expect(shown(withTrapFirst(game("ok", { maxStake: 10, minStake: 1 }), {}, seed))[0]).toBe("ok");
    expect(shown(withTrapFirst(game("big", { maxStake: 11 }), {}, seed))).not.toContain("big");
    expect(shown(withTrapFirst(game("dear", { minStake: 1.01 }), {}, seed))).not.toContain("dear");
  });
});

describe("check order and diagnostics", () => {
  it("doesn't check policy for a candidate that fails eligibility", () => {
    const r = withTrapFirst(game("trap", { status: "withdrawn", volatility: "extreme" }), {}, game("seed", { volatility: "low" }));
    expect(r.diagnostics["eligibility:not_live"]).toBe(1);
    expect(r.diagnostics["policy:volatility_escalation"]).toBeUndefined();
  });

  it("doesn't count a policy failure under quality", () => {
    const r = withTrapFirst(game("trap", { volatility: "extreme", insufficient: true }), {}, game("seed", { volatility: "low" }));
    expect(r.diagnostics["policy:volatility_escalation"]).toBe(1);
    expect(r.diagnostics["quality:thin_record"]).toBeUndefined();
  });

  it("skips an insufficient candidate", () => {
    const r = withTrapFirst(game("thin", { insufficient: true }));
    expect(shown(r)).not.toContain("thin");
    expect(r.diagnostics["quality:thin_record"]).toBe(1);
  });
});

describe("quality: a relation to the seed a player can see (no_shared_theme)", () => {
  // Every factory game has its own studio and no series, so only the theme can relate it unless a test says otherwise.
  const SEED_EGYPT = game("seed", { themes: ["egyptian", "adventure"] });
  const unrelated = (id: string, over: Partial<ServiceGame> = {}) => game(id, { themes: ["space"], ...over });
  const run = (candidate: ServiceGame, seed: ServiceGame = SEED_EGYPT) =>
    ask(indexWith([candidate, ...["f1", "f2", "f3"].map((id) => game(id, { themes: ["egyptian"] }))], seed));

  it("allows a candidate sharing one theme with the seed", () => {
    const r = run(game("mate", { themes: ["space", "adventure"] }));
    expect(shown(r)[0]).toBe("mate");
    expect(r.diagnostics["quality:no_shared_theme"]).toBeUndefined();
  });

  it("allows a candidate in the same series with no shared theme", () => {
    const seed = game("seed", { themes: ["egyptian"], seriesId: "pharaoh-saga" });
    const r = run(unrelated("sequel", { seriesId: "pharaoh-saga" }), seed);
    expect(shown(r)[0]).toBe("sequel");
    expect(r.diagnostics["quality:no_shared_theme"]).toBeUndefined();
  });

  it("removes a candidate from the same studio with no shared theme or series", () => {
    // Same studio was considered and dropped: with six studios it relates most of the catalogue (spec 02 §6.2).
    const r = run(unrelated("sibling", { provider: SEED_EGYPT.provider }));
    expect(shown(r)).not.toContain("sibling");
    expect(r.diagnostics["quality:no_shared_theme"]).toBe(1);
  });

  it("removes a candidate with no shared theme or series, even at similarity rank #1, and counts it", () => {
    const r = run(unrelated("stranger"));
    expect(r.status).toBe("ok");
    expect(shown(r)).toEqual(["f1", "f2", "f3"]);
    expect(r.diagnostics).toEqual({ "quality:no_shared_theme": 1 });
  });

  it("never matches an unknown series to another unknown", () => {
    const seed = game("seed", { themes: ["egyptian"], seriesId: null });
    const r = run(unrelated("stranger", { seriesId: null }), seed);
    expect(shown(r)).not.toContain("stranger");
    expect(r.diagnostics["quality:no_shared_theme"]).toBe(1);
  });

  it("fails closed for a seed with unknown themes: only its series can relate a candidate", () => {
    const seed = game("seed", { themes: [], seriesId: "pharaoh-saga" });
    const r = ask(indexWith([
      game("themed", { themes: ["egyptian"] }),
      game("sequel", { themes: ["egyptian"], seriesId: "pharaoh-saga" }),
      game("sibling", { themes: ["space"], provider: seed.provider }),
      game("sequel2", { themes: [], seriesId: "pharaoh-saga" }),
    ], seed));
    expect(r.diagnostics["quality:no_shared_theme"]).toBe(2);
    // Only the two series-mates survive: below minResults, so the rail is declined rather than padded.
    expect(r).toMatchObject({ status: "declined", reason: "NO_CONFIDENT_MATCHES", items: [] });
  });

  it("fails closed for a candidate with unknown themes", () => {
    const r = run(game("blank", { themes: [] }));
    expect(shown(r)).not.toContain("blank");
    expect(r.diagnostics["quality:no_shared_theme"]).toBe(1);
  });

  it("declines when every candidate is eligible but none is related", () => {
    const r = ask(indexWith([unrelated("a"), unrelated("b"), unrelated("c"), unrelated("d")], SEED_EGYPT));
    expect(r).toMatchObject({ status: "declined", reason: "NO_CONFIDENT_MATCHES" });
    expect(r.diagnostics["quality:no_shared_theme"]).toBe(4);
  });

  it("doesn't count an eligibility or policy failure under no_shared_theme", () => {
    const r = ask(indexWith([unrelated("x", { isTestGame: true }), unrelated("y", { volatility: "extreme" }), ...fillers()], game("seed", { volatility: "low" })));
    expect(r.diagnostics["eligibility:test_game"]).toBe(1);
    expect(r.diagnostics["policy:volatility_escalation"]).toBe(1);
    expect(r.diagnostics["quality:no_shared_theme"]).toBeUndefined();
  });
});

describe("dedupe", () => {
  it("skips a duplicate or RTP variant of the seed", () => {
    const r = withTrapFirst(game("dup", { dedupeKey: SEED.dedupeKey }));
    expect(shown(r)).not.toContain("dup");
    expect(r.diagnostics["quality:duplicate_or_rtp_variant"]).toBe(1);
  });

  it("skips a second record of an accepted game", () => {
    const r = ask(indexWith([game("a"), game("a-cms2", { dedupeKey: "a|studio" }), ...fillers()]));
    expect(shown(r)).toEqual(["a", "f1", "f2", "f3"]);
    expect(r.diagnostics["quality:duplicate_or_rtp_variant"]).toBe(1);
  });

  it("never shows two games with the same displayed name, even from different studios", () => {
    // Three different tables called "Roulette Royale" (as in the first OpenAI build): distinct dedupe keys, one name.
    const r = ask(indexWith([
      game("rr1", { title: "Roulette Royale", provider: "Bramble Games", dedupeKey: "rouletteroyale|bramblegames" }),
      game("rr2", { title: "ROULETTE ROYALE", provider: "Redwater Gaming", dedupeKey: "rouletteroyale|redwatergaming" }),
      game("rr3", { title: "Roulette  Royale!", provider: "Kestrel Play", dedupeKey: "rouletteroyale|kestrelplay" }),
      ...fillers(),
    ]));
    expect(shown(r)).toEqual(["rr1", "f1", "f2", "f3"]);
    expect(r.diagnostics["quality:duplicate_title"]).toBe(2);
    expect(r.diagnostics["quality:duplicate_or_rtp_variant"]).toBeUndefined();
  });

  it("never shows a different game with the seed's displayed name", () => {
    const seed = game("seed", { title: "Gods of Olympus" });
    const r = ask(indexWith([game("namesake", { title: "Gods of Olympus", provider: "Redwater Gaming" }), ...fillers()], seed));
    expect(shown(r)).not.toContain("namesake");
    expect(r.diagnostics["quality:duplicate_title"]).toBe(1);
  });

  it("counts a same-game duplicate once, as a duplicate, not also as a title clash", () => {
    const r = ask(indexWith([game("a", { title: "Gold Rush" }), game("a-cms2", { title: "GOLD RUSH", dedupeKey: "a|studio" }), ...fillers()]));
    expect(r.diagnostics).toEqual({ "quality:duplicate_or_rtp_variant": 1 });
  });

  it("doesn't let a rejected game's name block a namesake", () => {
    const r = ask(indexWith([game("x", { title: "Lucky 88", status: "withdrawn" }), game("y", { title: "Lucky 88" }), ...fillers()]));
    expect(shown(r)).toEqual(["y", "f1", "f2", "f3"]);
  });

  it("counts only accepted items: a rejected record doesn't block its duplicate", () => {
    const r = ask(indexWith([game("a", { status: "withdrawn" }), game("a-cms2", { dedupeKey: "a|studio" }), ...fillers()]));
    expect(shown(r)).toEqual(["a-cms2", "f1", "f2", "f3"]);
  });
});

describe("diversity", () => {
  it("caps a studio at 3, not counting the seed", () => {
    const seed = game("seed", { provider: "Kestrel Play" });
    const same = Array.from({ length: 4 }, (_, i) => game(`k${i}`, { provider: "Kestrel Play" }));
    const r = ask(indexWith(same, seed));
    expect(shown(r)).toEqual(["k0", "k1", "k2"]);
    expect(r.diagnostics["diversity:provider_cap"]).toBe(1);
  });

  it("caps a series at 2, not counting the seed; a null series isn't capped", () => {
    const seed = game("seed", { seriesId: "sands" });
    const r = ask(indexWith([game("s1", { seriesId: "sands" }), game("s2", { seriesId: "sands" }), game("s3", { seriesId: "sands" }), ...fillers()], seed));
    expect(shown(r)).toEqual(["s1", "s2", "f1", "f2", "f3"]);
    expect(r.diagnostics["diversity:series_cap"]).toBe(1);
    expect(shown(ask(indexWith(fillers(5))))).toHaveLength(5);
  });

  it("treats a null studio as one studio, 'unknown'", () => {
    const r = ask(indexWith(Array.from({ length: 4 }, (_, i) => game(`n${i}`, { provider: null }))));
    expect(shown(r)).toEqual(["n0", "n1", "n2"]);
    expect(r.diagnostics["diversity:provider_cap"]).toBe(1);
  });
});

describe("threshold, limit and abstention", () => {
  it("stops at the first neighbour below the embedder's threshold", () => {
    // The test build after the cut-off is never examined, so it leaves no diagnostic.
    const r = ask(indexWith([game("a"), game("b"), game("c"), game("below"), game("test", { isTestGame: true })], SEED, [0.9, 0.8, 0.3, 0.29, 0.95]));
    expect(shown(r)).toEqual(["a", "b", "c"]);
    expect(r.diagnostics).toEqual({});
  });

  it("clamps the limit to 1…maxLimit and defaults to defaultLimit", () => {
    const index = indexWith(fillers(20));
    expect(ask(index, { limit: 50 }).items).toHaveLength(12);
    expect(ask(index, { limit: 0 }).items).toHaveLength(1);
    expect(ask(index, { limit: undefined }).items).toHaveLength(6);
    expect([clampLimit(-3, config), clampLimit(2.7, config), clampLimit(undefined, config)]).toEqual([1, 2, 6]);
  });

  it("declines with NO_CONFIDENT_MATCHES when fewer than min(3, limit) survive, and never pads", () => {
    const two = indexWith(fillers(2));
    const r = ask(two);
    expect(r).toMatchObject({ status: "declined", reason: "NO_CONFIDENT_MATCHES", items: [] });
    expect(ask(two, { limit: 2 })).toMatchObject({ status: "ok" });
    expect(ask(two, { limit: 1 }).items).toHaveLength(1);
  });

  it("refuses an index whose embedder has no threshold", () => {
    expect(() => ask({ ...indexWith(fillers()), embedding: { id: "mystery-embedder", dim: 8 } })).toThrow(/no score threshold/);
  });
});

describe("decline reasons, in order", () => {
  const index = indexWith(fillers());
  const cases: Array<[DeclineReason, Partial<RecommendRequest>, RecommendIndex?]> = [
    ["BRAND_DISABLED", { brand: "meridian" }],
    ["MARKET_NOT_SERVED_BY_BRAND", { brand: "liberty", market: "GB" }],
    ["PLAYER_RESTRICTED", { playerRestricted: true }],
    ["UNKNOWN_GAME", { gameId: "no-such-game" }],
    ["SEED_NOT_AVAILABLE", {}, indexWith(fillers(), game("seed", { markets: ["ES"] }))],
    ["INSUFFICIENT_SOURCE_DATA", {}, indexWith(fillers(), game("seed", { insufficient: true }))],
    ["NO_CONFIDENT_MATCHES", {}, indexWith(fillers(2))],
  ];

  it("has a test case for every decline reason", () => {
    expect(cases.map(([reason]) => reason).sort()).toEqual([...DECLINE_REASONS].sort());
  });

  it.each(cases)("%s", (reason, over, idx) => {
    expect(ask(idx ?? index, over)).toMatchObject({ status: "declined", reason, items: [] });
  });

  it("treats an unknown brand as disabled", () => {
    expect(ask(index, { brand: "acme" }).reason).toBe("BRAND_DISABLED");
    // Inside recommend() the brand check comes first, even in a market the brand doesn't serve.
    expect(ask(index, { brand: "meridian", market: "ES" }).reason).toBe("BRAND_DISABLED");
  });

  it("puts the player's restriction before every seed check, but after the brand", () => {
    expect(ask(index, { playerRestricted: true, gameId: "no-such-game" }).reason).toBe("PLAYER_RESTRICTED");
    expect(ask(index, { playerRestricted: true, brand: "meridian" }).reason).toBe("BRAND_DISABLED");
  });

  it("declines a test-build seed as not available", () => {
    expect(ask(indexWith(fillers(), game("seed", { isTestGame: true }))).reason).toBe("SEED_NOT_AVAILABLE");
  });

  it("still recommends from a withdrawn, out-of-season or off-brand seed", () => {
    for (const over of [{ status: "withdrawn" as const }, { seasonMonths: [12] }, { brands: ["harbour"] }]) {
      expect(ask(indexWith(fillers(), game("seed", over)))).toMatchObject({ status: "ok", items: expect.any(Array) });
    }
  });

  it("serves an NJ player on liberty", () => {
    expect(ask(index, { brand: "liberty", market: "NJ" }).status).toBe("ok");
  });
});
