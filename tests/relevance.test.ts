import { describe, expect, it } from "vitest";
import type { CanonicalGame } from "../src/domain/types.js";
import { dcg, ndcgAtK, relevance } from "../eval/relevance.js";

const game = (over: Partial<CanonicalGame> = {}): CanonicalGame => ({
  id: "g-x", title: "X", provider: "Kestrel Play", aggregator: null, gameType: "slot", themes: ["egyptian"], mechanics: ["cascading_reels"],
  volatility: "high", rtp: 96, minStake: 0.2, maxStake: 50, reelLayout: "5x3, 20 lines", maxWinMultiplier: 5000, jackpotNetwork: null,
  releaseYear: 2020, description: "d", seriesId: null, brands: ["aurora"], markets: ["GB"], status: "active", isTestGame: false,
  seasonMonths: null, benchmarkCluster: null, clusterRole: null, ...over,
});

describe("silver relevance labels (spec 06 §3, appendix A11), in table order", () => {
  it("3: same non-null series, whatever else differs", () => {
    expect(relevance(game({ seriesId: "s1" }), game({ seriesId: "s1", gameType: "bingo", themes: ["space"], mechanics: [] }))).toBe(3);
    // Two games without a series aren't "the same series".
    expect(relevance(game({ seriesId: null, gameType: "bingo", themes: ["space"] }), game({ seriesId: null, themes: ["fruit"] }))).toBe(0);
  });

  it("2: same type, a shared theme, and a shared distinctive mechanic or the same volatility", () => {
    expect(relevance(game(), game({ volatility: "low" }))).toBe(2); // shared cascading_reels
    expect(relevance(game({ mechanics: [] }), game({ mechanics: [] }))).toBe(2); // same volatility
    expect(relevance(game({ mechanics: [] }), game({ mechanics: [], volatility: "low" }))).toBe(1); // neither → falls to grade 1
  });

  it("2: same type and the same non-null jackpot network", () => {
    const a = game({ themes: ["space"], mechanics: [], jackpotNetwork: "Daily Vault" });
    expect(relevance(a, game({ themes: ["fruit"], mechanics: [], volatility: "low", jackpotNetwork: "Daily Vault" }))).toBe(2);
    expect(relevance(a, game({ themes: ["fruit"], mechanics: [], volatility: "low", jackpotNetwork: "Crown Jackpots" }))).toBe(0);
  });

  it("1: same type and a shared theme, or two shared distinctive mechanics, or a non-slot type", () => {
    expect(relevance(game({ mechanics: ["megaways"] }), game({ mechanics: ["bonus_buy"], volatility: "low" }))).toBe(1);
    expect(relevance(game({ themes: ["space"], mechanics: ["megaways", "bonus_buy"] }), game({ themes: ["fruit"], mechanics: ["megaways", "bonus_buy"] }))).toBe(1);
    expect(relevance(game({ themes: ["space"], mechanics: ["megaways"] }), game({ themes: ["fruit"], mechanics: ["megaways"] }))).toBe(0); // one shared mechanic isn't enough
    expect(relevance(game({ gameType: "bingo", themes: ["space"] }), game({ gameType: "bingo", themes: ["fruit"], mechanics: [] }))).toBe(1);
  });

  it("1: table and live are one family when they share a theme", () => {
    expect(relevance(game({ gameType: "table", themes: ["roulette"] }), game({ gameType: "live", themes: ["roulette"], mechanics: ["live_dealer"] }))).toBe(1);
    expect(relevance(game({ gameType: "table", themes: ["roulette"] }), game({ gameType: "live", themes: ["cards"] }))).toBe(0);
    expect(relevance(game({ gameType: "slot", themes: ["roulette"] }), game({ gameType: "live", themes: ["roulette"] }))).toBe(0);
  });

  it("ignores the generic mechanics for overlap", () => {
    const generic = ["free_spins", "fixed_paylines", "multipliers"] as CanonicalGame["mechanics"];
    expect(relevance(game({ themes: ["space"], mechanics: generic }), game({ themes: ["fruit"], mechanics: generic }))).toBe(0);
    expect(relevance(game({ mechanics: ["free_spins"] }), game({ mechanics: ["free_spins"], volatility: "low" }))).toBe(1);
  });
});

describe("dcg and ndcgAtK", () => {
  it("dcg = Σ (2^g − 1) / log2(i + 2)", () => {
    expect(dcg([])).toBe(0);
    expect(dcg([3])).toBe(7);
    expect(dcg([3, 2, 1])).toBeCloseTo(7 + 3 / Math.log2(3) + 1 / 2, 10);
  });

  it("ndcgAtK divides by the ideal top k of the pool, sorted", () => {
    expect(ndcgAtK([3, 2], [1, 2, 3], 2)).toBe(1);
    expect(ndcgAtK([2, 3], [3, 2], 2)).toBeCloseTo((3 + 7 / Math.log2(3)) / (7 + 3 / Math.log2(3)), 10);
    expect(ndcgAtK([1, 1, 1, 1, 1, 3], [3, 1, 1, 1, 1, 1], 5)).toBeLessThan(1); // the 6th item is cut at k
    expect(ndcgAtK([0, 0], [2, 0], 5)).toBe(0);
  });

  it("is 0 when the ideal is 0", () => {
    expect(ndcgAtK([0, 0, 0], [0, 0], 5)).toBe(0);
    expect(ndcgAtK([], [], 5)).toBe(0);
  });
});
