import { describe, expect, it } from "vitest";
import type { ServiceGame } from "../src/domain/index-schema.js";
import type { RecommendIndex } from "../src/service/recommender.js";
import { loadServiceConfig } from "../src/service/service-config.js";
import { NJ_NO_RAILS_NOTE, pickNjCase } from "../scripts/demo-cases.js";

const config = loadServiceConfig();

const game = (id: string, themes: ServiceGame["themes"], over: Partial<ServiceGame> = {}): ServiceGame => ({
  id, title: `Game ${id}`, provider: `Studio ${id}`, gameType: "slot", seriesId: null, dedupeKey: `${id}|studio`,
  brands: ["liberty"], markets: ["NJ"], status: "active", isTestGame: false, seasonMonths: null, insufficient: false,
  volatility: "medium", maxStake: 10, minStake: 0.2, mechanics: ["free_spins"], themes, ...over,
});

/** Every game is every other game's neighbour, scored 0.9. */
const indexOf = (games: ServiceGame[]): RecommendIndex => ({
  embedding: { id: "hashing-v1", dim: 512 },
  games: Object.fromEntries(games.map((g) => [g.id, g])),
  neighbours: Object.fromEntries(games.map((g) => [g.id, games.filter((o) => o.id !== g.id).map((o) => [o.id, 0.9] as [string, number])])),
});

describe("demo case 3: an NJ player on liberty (spec 05 §8)", () => {
  it("picks the first seed that gets a rail, expecting 200 ok, when one exists", () => {
    const games = [game("g-1", ["egyptian"]), ...["a", "b", "c", "d"].map((s) => game(`g-2${s}`, ["fruit"]))];
    expect(pickNjCase(indexOf(games), config, 7)).toEqual({ gameId: "g-2a", expect: "200 ok", note: null });
  });

  it("falls back to a documented NO_CONFIDENT_MATCHES decline when no seed gets a rail, instead of failing", () => {
    // Every theme is carried by fewer than three games, like liberty/NJ on the committed builds.
    const games = [game("g-0", [], { insufficient: true }), game("g-1", ["egyptian"]), game("g-2", ["egyptian"]), game("g-3", ["fruit"]), game("g-4", ["fishing"])];
    expect(pickNjCase(indexOf(games), config, 7)).toEqual({ gameId: "g-1", expect: "200 declined NO_CONFIDENT_MATCHES", note: NJ_NO_RAILS_NOTE });
  });

  it("returns null only when no liberty/NJ seed exists", () => {
    expect(pickNjCase(indexOf([game("g-1", ["fruit"], { markets: ["GB"] })]), config, 7)).toBeNull();
  });
});
