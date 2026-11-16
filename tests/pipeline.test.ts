import { describe, expect, it } from "vitest";
import { GENERATION_TEMPERATURE, assertUniqueTitleStudio, generateOffline, generateWithLlm } from "../src/catalogue/creative.js";
import type { CreativeGame } from "../src/catalogue/creative.js";
import { evaluationDimensions, generateDataset } from "../src/catalogue/dataset.js";
import { assembleCanonical, degrade, idForSlot } from "../src/catalogue/degrade.js";
import { addTrapGames } from "../src/catalogue/traps.js";
import type { Special } from "../src/catalogue/degrade.js";
import { BENCHMARK_CLUSTERS, buildSlate } from "../src/catalogue/slate.js";
import type { RawRecord } from "../src/domain/types.js";
import { JACKPOT_NETWORKS, MECHANICS, PROVIDERS, TAG_SYNONYMS, THEMES, type Mechanic, type Theme } from "../src/domain/vocabulary.js";
import { normaliseRecord } from "../src/pipeline/normalise.js";
import { jsonFileText } from "../src/util/misc.js";
import { FakeJsonLlm, noSleep, slotsInRequest } from "./helpers/fake-llm.js";
import { offlineDataset } from "./helpers/offline-dataset.js";

const TRAP_SPECIALS: Special[] = ["market_twin", "escalation_twin", "lifecycle_suspended", "lifecycle_cert_expired", "lifecycle_demo_only", "test_game"];

const rawById = (raw: RawRecord[], id: string): RawRecord => {
  const r = raw.find((x) => x.game_id === id);
  if (!r) throw new Error(`no raw record ${id}`);
  return r;
};

describe("slate", () => {
  const slate = buildSlate();

  it("has the target mix", () => {
    const byType = (t: string) => slate.filter((s) => s.gameType === t).length;
    expect(slate).toHaveLength(100);
    expect([byType("slot"), byType("table"), byType("live"), byType("instant_win"), byType("bingo")]).toEqual([70, 9, 9, 7, 5]);
    expect(slate.filter((s) => s.seriesName)).toHaveLength(20);
    expect(new Set(slate.map((s) => s.seriesName).filter(Boolean)).size).toBe(8);
    expect(slate.filter((s) => s.cluster)).toHaveLength(28);
    expect(slate.filter((s) => s.misleadingTitle).every((s) => s.gameType === "instant_win")).toBe(true);
    expect(slate.filter((s) => s.misleadingTitle)).toHaveLength(2);
    expect(slate.map((s) => s.slot)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });

  it("is deterministic for a seed", () => {
    expect(buildSlate()).toEqual(slate);
    expect(buildSlate(43)).not.toEqual(slate);
  });
});

describe("offline dataset", () => {
  it("builds 108 canonical games (100 + 8 traps) and 113 feed records", async () => {
    const d = await offlineDataset();
    expect(d.canonical).toHaveLength(108);
    expect(d.canonical.filter((g) => g.gameType === "slot")).toHaveLength(78);
    expect(d.raw).toHaveLength(113);
    expect(d.reference).toHaveLength(113);
    expect(d.manifest).toMatchObject({ provider: "offline", model: null, counts: { canonicalGames: 108, feedRecords: 113 } });
    expect(String(d.manifest.note)).toMatch(/offline/);
  });

  it("is byte-identical across runs (the manifest differs only in its timestamp)", async () => {
    const a = await generateDataset({ now: () => new Date("2026-01-01T00:00:00Z") });
    const b = await generateDataset({ now: () => new Date("2026-06-01T00:00:00Z") });
    expect(jsonFileText(b.raw)).toBe(jsonFileText(a.raw));
    expect(jsonFileText(b.canonical)).toBe(jsonFileText(a.canonical));
    expect(jsonFileText(b.reference)).toBe(jsonFileText(a.reference));
    const { generatedAt: ta, ...ma } = a.manifest;
    const { generatedAt: tb, ...mb } = b.manifest;
    expect(ta).not.toBe(tb);
    expect(mb).toEqual(ma);
  });

  it("keeps the slate contract: primary theme first, series share a studio, clusters forced", async () => {
    const { canonical } = await offlineDataset();
    const slate = buildSlate();
    for (const s of slate) {
      const g = canonical.find((x) => x.id === idForSlot(s.slot))!;
      expect(g.gameType).toBe(s.gameType);
      expect(g.themes[0]).toBe(s.primaryTheme);
      if (s.forced) {
        expect(g.mechanics).toEqual(s.forced.mechanics);
        expect(g.volatility).toBe(s.forced.volatility);
      }
      if (g.jackpotNetwork) expect(g.mechanics).toContain("progressive_jackpot");
    }
    const bySeries = new Map<string, Set<string>>();
    for (const g of canonical.filter((x) => x.seriesId)) bySeries.set(g.seriesId!, (bySeries.get(g.seriesId!) ?? new Set()).add(g.provider));
    expect([...bySeries.values()].every((providers) => providers.size === 1)).toBe(true);
    // No base game is a test build; the only one is spec 02's trap.
    expect(canonical.filter((g) => g.isTestGame).map((g) => g.id)).toEqual(["g-108"]);
  });
});

describe("data-quality edge cases (spec 01 §7.3)", () => {
  const specialsCount = async () => {
    const counts: Partial<Record<Special, number>> = {};
    for (const r of (await offlineDataset()).reference) for (const s of r.specials) counts[s] = (counts[s] ?? 0) + 1;
    return counts;
  };
  const recordsWith = async (special: Special) => {
    const d = await offlineDataset();
    return d.reference.filter((r) => r.specials.includes(special)).map((r) => ({ ref: r, raw: rawById(d.raw, r.rawId) }));
  };

  it("plants every edge case with its controlled count", async () => {
    expect(await specialsCount()).toMatchObject({
      misleading_title: 2,
      marketing_fluff: 2,
      new_release: 2,
      duplicate_export: 3,
      rtp_variant: 2,
      prompt_injection: 2,
      non_english: 1,
      noisy_tags: 2,
      markets_missing: 2,
      status_missing: 1,
      studio_aggregator_swap: 1,
      cryptic: 3,
    });
    const { reference } = await offlineDataset();
    expect(reference.filter((r) => r.profile === "title_only")).toHaveLength(8);
  });

  it("picks edge cases only from live, unreserved games", async () => {
    const d = await offlineDataset();
    // The 25 picks: 12 edge cases, 3 duplicated and 2 RTP-varied originals, 5 title-only, 3 opaque.
    // Title-only picks and the originals of duplicates carry no special of their own.
    const notPicked = new Set<Special>(["misleading_title", "seasonal", ...TRAP_SPECIALS]);
    const picks = d.reference.filter((r) => r.specials.some((s) => !notPicked.has(s)) || (r.profile === "title_only" && !r.specials.length));
    expect(new Set(picks.map((r) => r.canonicalId)).size).toBe(25);
    for (const r of picks) {
      const g = d.canonical.find((x) => x.id === r.canonicalId)!;
      expect(g.status).toBe("active");
      expect(g.seasonMonths).toBeNull();
      expect(g.benchmarkCluster).toBeNull();
    }
  });

  it("misleading titles keep only the accurate description", async () => {
    for (const { raw } of await recordsWith("misleading_title")) {
      expect(raw.name).toMatch(/Megaways/);
      expect(raw).not.toHaveProperty("category");
      expect(raw).not.toHaveProperty("specs");
      expect(raw).not.toHaveProperty("reel_layout");
      expect(normaliseRecord(raw).description).toMatch(/scratch card/);
      expect(raw.tags === undefined || (Array.isArray(raw.tags) && raw.tags.length <= 1)).toBe(true);
    }
  });

  it("marketing fluff has no gameplay facts, tags, volatility or specs", async () => {
    for (const { raw } of await recordsWith("marketing_fluff")) {
      expect(String(raw.description)).not.toMatch(/volatility|features include|reel|spins?\b/i);
      expect(raw).not.toHaveProperty("volatility");
      expect(raw).not.toHaveProperty("specs");
      expect(raw).not.toHaveProperty("reel_layout");
      expect(raw).toHaveProperty("category");
    }
  });

  it("cold-start releases carry only coarse tags and today's date", async () => {
    for (const { raw } of await recordsWith("new_release")) {
      expect(raw.release).toBe("2026-11-10");
      expect(raw.description).toBeNull();
      for (const k of ["category", "volatility", "specs", "reel_layout"]) expect(raw).not.toHaveProperty(k);
      const tags = raw.tags as string[];
      expect(tags.length === 3 || (tags.length === 4 && tags[3] === "Bonus Buy")).toBe(true);
      expect(tags[1]).toMatch(/^(Low|Medium|High|Extreme) Volatility$/);
      const g = normaliseRecord(raw);
      expect(g.gameType).not.toBeNull();
      expect(g.volatility).not.toBeNull();
      expect(g.themes.length).toBeGreaterThan(0);
    }
  });

  it("duplicate exports and RTP variants share the original's dedupe key", async () => {
    const d = await offlineDataset();
    for (const special of ["duplicate_export", "rtp_variant"] as const) {
      for (const { ref, raw } of await recordsWith(special)) {
        expect(ref.rawId).not.toBe(ref.canonicalId);
        expect(normaliseRecord(raw).dedupeKey).toBe(normaliseRecord(rawById(d.raw, ref.canonicalId)).dedupeKey);
      }
    }
    for (const { raw } of await recordsWith("duplicate_export")) expect(String(raw.game_id)).toMatch(/-cms2$/);
    for (const { raw } of await recordsWith("rtp_variant")) expect(String(raw.game_id)).toMatch(/-rtp\d{2}$/);
  });

  it("repairs the studio/aggregator swap back to the true provider", async () => {
    const d = await offlineDataset();
    const [swap] = await recordsWith("studio_aggregator_swap");
    const truth = d.canonical.find((g) => g.id === swap!.ref.canonicalId)!;
    const g = normaliseRecord(swap!.raw);
    expect(g.provider).toBe(truth.provider);
    expect(g.issues).toContain("studio_aggregator_repaired");
    expect(g.dedupeKey).toBe(normaliseRecord(rawById(d.raw, truth.id)).dedupeKey);
  });

  it("prompt injections end with the hostile instruction and lose their volatility", async () => {
    for (const { raw } of await recordsWith("prompt_injection")) {
      expect(String(raw.description)).toMatch(/ignore all previous instructions/);
      expect(raw).not.toHaveProperty("volatility");
    }
  });

  it("plants the Spanish description, noisy tags, missing markets and missing status", async () => {
    expect(String((await recordsWith("non_english"))[0]!.raw.description)).toMatch(/tragamonedas/);
    for (const { raw } of await recordsWith("noisy_tags")) expect(normaliseRecord(raw).unknownTags).toEqual(expect.arrayContaining(["🔥 HOT", "new!!", "Top 10"]));
    for (const { raw } of await recordsWith("markets_missing")) expect(normaliseRecord(raw).markets).toEqual([]);
    for (const { raw } of await recordsWith("status_missing")) expect(normaliseRecord(raw).status).toBe("withdrawn");
  });

  it("opaque and title-only records carry a title and operational fields only", async () => {
    const d = await offlineDataset();
    for (const r of d.reference.filter((x) => x.profile === "title_only")) {
      const raw = rawById(d.raw, r.rawId);
      for (const k of ["category", "volatility", "rtp", "max_bet", "min_bet", "specs", "reel_layout"]) expect(raw).not.toHaveProperty(k);
      expect(raw).toHaveProperty("brands");
      expect(raw).toHaveProperty("status");
    }
    for (const { raw } of await recordsWith("cryptic")) {
      expect(raw.name).toMatch(/^GAME_\d{4}_V1$/);
      expect(raw.studio).toBe("Unknown");
      expect(normaliseRecord(raw).provider).toBeNull();
    }
  });

  it("emits specs both nested and as flat columns", async () => {
    const { raw } = await offlineDataset();
    expect(raw.some((r) => typeof r.specs === "object" && r.specs !== null)).toBe(true);
    expect(raw.some((r) => "reel_layout" in r)).toBe(true);
  });

  it("emits format noise across the feed", async () => {
    const { raw } = await offlineDataset();
    expect(raw.some((r) => typeof r.tags === "string")).toBe(true);
    expect(raw.some((r) => Array.isArray(r.tags))).toBe(true);
    expect(raw.some((r) => typeof r.markets === "string" && r.markets.includes("UK"))).toBe(true);
    expect(raw.some((r) => typeof r.min_bet === "string" && r.min_bet.endsWith("p"))).toBe(true);
    expect(raw.some((r) => typeof r.description === "string" && r.description.startsWith("<p>"))).toBe(true);
    expect(raw.some((r) => typeof r.name === "string" && r.name.includes("™"))).toBe(true);
  });
});

describe("declared features survive degradation (spec 01 §7.4)", () => {
  it("every non-title-only record still normalises to bonus_buy when every game has it", async () => {
    const d = await offlineDataset();
    const withBonusBuy = d.canonical.map((g) => ({ ...g, mechanics: [...new Set<Mechanic>([...g.mechanics, "bonus_buy"])] }));
    const slate = buildSlate();
    const misleadingTitleIds = new Set(slate.filter((s) => s.misleadingTitle).map((s) => idForSlot(s.slot)));
    const { raw, reference } = degrade(withBonusBuy, { misleadingTitleIds });
    const checked = reference.filter((r) => r.profile !== "title_only");
    expect(checked.length).toBeGreaterThan(90);
    for (const r of checked) expect(normaliseRecord(rawById(raw, r.rawId)).mechanics).toContain("bonus_buy");
  });
});

describe("LLM generation enforces the slate contract (fake LLM)", () => {
  const slate = buildSlate();

  /** A model that gets everything wrong it can while still passing the schema. */
  const misbehavingGames = (user: string) =>
    slotsInRequest(user).map(({ slot }) => ({
        slot,
        title: `Invented Game ${slot}`,
        provider: PROVIDERS[slot % PROVIDERS.length]!,
        themes: ["candy", "gems", "horror", "space", "music", "candy"] satisfies Theme[],
        mechanics: (slot === 1
          ? ["progressive_jackpot", "free_spins"]
          : ["free_spins", "free_spins", "multipliers", "megaways", "sticky_wilds", "pick_bonus", "hold_and_win"]) satisfies Mechanic[],
        volatility: "extreme",
        rtp: 99.9,
        minStake: 0.01,
        maxStake: 1000,
        reelLayout: "5x3, 20 lines",
        maxWinMultiplier: 1_000_000,
        jackpotNetwork: slot === 1 ? "Daily Vault" : JACKPOT_NETWORKS[0],
        releaseYear: 2031,
        description: "A game.",
      }));
  const misbehaving = () => new FakeJsonLlm((args) => ({ games: misbehavingGames(args.user) }));

  it("clamps numbers, fixes themes and jackpots, aligns series and forces clusters", async () => {
    const llm = misbehaving();
    const games = await generateWithLlm(slate, llm, { system: "test prompt" });
    expect(llm.calls).toHaveLength(10);
    expect(llm.calls.every((c) => c.temperature === GENERATION_TEMPERATURE && c.temperature === 0.7)).toBe(true);
    expect(games.map((g) => g.slot)).toEqual(slate.map((s) => s.slot));

    for (const g of games) {
      const s = slate.find((x) => x.slot === g.slot)!;
      expect(g.themes[0]).toBe(s.primaryTheme);
      expect(new Set(g.themes).size).toBe(g.themes.length);
      expect(g.themes.length).toBeLessThanOrEqual(4);
      expect(new Set(g.mechanics).size).toBe(g.mechanics.length);
      expect(g.mechanics.length).toBeLessThanOrEqual(5);
      expect(g.rtp).toBe(97.5);
      expect(g.releaseYear).toBe(2026);
      expect(g.maxWinMultiplier).toBe(50000);
      if (g.jackpotNetwork !== null) expect(g.mechanics).toContain("progressive_jackpot");
      if (s.forced) {
        expect(g.themes).toEqual([...new Set([s.primaryTheme, ...s.forced.extraThemes])]);
        expect(g.mechanics).toEqual(s.forced.mechanics);
        expect(g.volatility).toBe(s.forced.volatility);
        expect([g.minStake, g.maxStake]).toEqual([0.2, 50]);
        expect(g.jackpotNetwork).toBeNull();
      } else {
        expect([g.minStake, g.maxStake]).toEqual([0.1, 100]);
        expect(g.volatility).toBe("extreme");
      }
    }
    // A valid network survives on a progressive game, unless the slot is a forced cluster entry.
    const first = games.find((g) => g.slot === 1)!;
    if (!slate.find((s) => s.slot === 1)!.forced) expect(first.jackpotNetwork).toBe("Daily Vault");

    // Every series member gets the studio of the first member in slate order.
    for (const name of new Set(slate.map((s) => s.seriesName).filter((x): x is string => !!x))) {
      const members = slate.filter((s) => s.seriesName === name).sort((a, b) => a.slot - b.slot);
      const expected = PROVIDERS[members[0]!.slot % PROVIDERS.length];
      for (const m of members) expect(games.find((g) => g.slot === m.slot)!.provider).toBe(expected);
    }

    // Cluster members get 5 distinct studios.
    for (const cluster of new Set(slate.map((s) => s.cluster).filter(Boolean))) {
      const members = slate.filter((s) => s.cluster === cluster && s.clusterRole === "member");
      expect(new Set(members.map((m) => games.find((g) => g.slot === m.slot)!.provider)).size).toBe(5);
    }
  });

  it("sends the strict schema and every slate entry, with cluster constraints spelled out", async () => {
    const llm = misbehaving();
    await generateWithLlm(slate, llm, { system: "test prompt" });
    const users = llm.calls.map((c) => c.user).join("\n");
    expect(slotsInRequest(users)).toHaveLength(100);
    expect(users).toMatch(/MUST use mechanics=cascading_reels,multipliers; volatility=high; also themes=none/);
    expect(users).toMatch(/misleading title/);
    expect(llm.calls[0]!.schema).toMatchObject({ additionalProperties: false, required: ["games"] });
  });

  it("fails the run, after 3 attempts, when a batch returns the wrong number of games", async () => {
    const llm = new FakeJsonLlm((args) => ({ games: misbehavingGames(args.user).slice(1) }));
    await expect(generateWithLlm(slate, llm, { system: "p", retry: noSleep })).rejects.toThrow(/expected 10 games, got 9/);
    expect(llm.calls).toHaveLength(3);
  });

  it("fails the run when the response breaks our schema, even if the provider accepted it", async () => {
    const llm = new FakeJsonLlm(() => ({ games: [{ slot: 1, title: "x", provider: "A Real Studio" }] }));
    await expect(generateWithLlm(slate, llm, { system: "p", retry: noSleep })).rejects.toThrow();
    expect(llm.calls).toHaveLength(3);
  });

  it("retries a failed batch and carries on when a retry succeeds", async () => {
    const good = misbehaving();
    const llm = new FakeJsonLlm((args, i) => {
      if (i === 0) throw new Error("429 rate limited");
      return good.completeJson(args);
    });
    const games = await generateWithLlm(slate, llm, { system: "p", retry: noSleep });
    expect(games).toHaveLength(100);
    expect(llm.calls).toHaveLength(11);
  });
});

describe("title and studio uniqueness", () => {
  const game = (slot: number, title: string, provider: string) => ({ slot, title, provider }) as CreativeGame;

  it("fails on a repeated title from the same studio", () => {
    expect(() => assertUniqueTitleStudio([game(1, "Gold Rush", "Lumen Studios"), game(2, "GOLD RUSH", "Lumen Studios")])).toThrow(/duplicate title and studio/);
  });

  it("allows the same title from different studios", () => {
    expect(() => assertUniqueTitleStudio([game(1, "Gold Rush", "Lumen Studios"), game(2, "Gold Rush", "Kestrel Play")])).not.toThrow();
  });
});

describe("benchmark clusters (spec 03)", () => {
  const MEMBER_VOLATILITY: Record<string, string[]> = {
    egyptian_cascade: ["high"],
    fishing_cash_collect: ["medium", "high"],
    classic_fruit: ["low"],
    live_game_show: ["medium"],
  };

  it("has the vocabulary the clusters need", () => {
    expect(THEMES).toContain("fishing");
    expect(MECHANICS).toContain("cash_collect");
    expect(TAG_SYNONYMS).toMatchObject({ fish: "fishing", angler: "fishing", "cash collect": "cash_collect", "coin collect": "cash_collect" });
  });

  it("puts 28 cluster entries in the slate and keeps the overall mix", () => {
    const slate = buildSlate();
    const clustered = slate.filter((s) => s.cluster);
    expect(clustered).toHaveLength(28);
    expect(clustered.every((s) => s.forced && s.clusterRole)).toBe(true);
    // Outside the clusters: 9 table, 2 live, 5 instant win, 4 bingo, and the rest slots.
    const others = slate.filter((s) => !s.cluster);
    const count = (t: string) => others.filter((s) => s.gameType === t).length;
    expect([count("table"), count("live"), count("instant_win"), count("bingo")]).toEqual([9, 2, 5, 4]);
  });

  it("has exactly 5 members and 2 near-misses per cluster, with the spec's attributes", async () => {
    const { canonical } = await offlineDataset();
    for (const c of BENCHMARK_CLUSTERS) {
      const members = canonical.filter((g) => g.benchmarkCluster === c.id && g.clusterRole === "member");
      const nearMisses = canonical.filter((g) => g.benchmarkCluster === c.id && g.clusterRole === "near_miss");
      expect(members).toHaveLength(5);
      expect(nearMisses).toHaveLength(2);
      for (const g of members) {
        expect(g.themes[0]).toBe(c.theme);
        expect(g.themes).toEqual([c.theme, ...(c.member.extraThemes ?? [])]);
        expect(g.gameType).toBe(c.member.gameType);
        expect(g.mechanics).toEqual(c.member.mechanics);
        expect(MEMBER_VOLATILITY[c.id]).toContain(g.volatility);
        expect(g.status).toBe("active");
        expect([g.minStake, g.maxStake]).toEqual([0.2, 50]);
        expect(g.jackpotNetwork).toBeNull();
      }
      expect(new Set(members.map((g) => g.provider)).size).toBe(5);
      for (const g of nearMisses) {
        expect(g.themes[0]).toBe(c.theme);
        const differs = g.gameType !== c.member.gameType || JSON.stringify(g.mechanics) !== JSON.stringify(c.member.mechanics);
        expect(differs).toBe(true);
        expect([g.minStake, g.maxStake]).toEqual([0.2, 50]);
      }
    }
  });

  it("alternates medium and high for the fishing members", async () => {
    const { canonical } = await offlineDataset();
    const vols = canonical.filter((g) => g.benchmarkCluster === "fishing_cash_collect" && g.clusterRole === "member").map((g) => g.volatility);
    expect(vols.filter((v) => v === "medium")).toHaveLength(3);
    expect(vols.filter((v) => v === "high")).toHaveLength(2);
  });

  it("makes every cluster game available everywhere in Europe", async () => {
    const { canonical } = await offlineDataset();
    for (const g of canonical.filter((x) => x.benchmarkCluster)) {
      expect(g.brands).toEqual(expect.arrayContaining(["aurora", "harbour", "meridian"]));
      expect(g.markets).toEqual(expect.arrayContaining(["GB", "ES", "SE", "NL"]));
      expect(g.status).toBe("active");
    }
  });

  it("corrects every forced entry when the LLM returns wrong themes, mechanics and volatility", async () => {
    const slate = buildSlate();
    const llm = new FakeJsonLlm((args) => ({
      games: slotsInRequest(args.user).map(({ slot }) => ({
        slot,
        title: `Wrong Game ${slot}`,
        provider: "Lumen Studios", // the same studio for everything
        themes: ["horror", "space"],
        mechanics: ["megaways", "progressive_jackpot"],
        volatility: "extreme",
        rtp: 96,
        minStake: 1,
        maxStake: 90,
        reelLayout: "6x7 Megaways, 117,649 ways",
        maxWinMultiplier: 20000,
        jackpotNetwork: "Starfall Network",
        releaseYear: 2020,
        description: "A horror megaways slot.",
      })),
    }));
    const games = await generateWithLlm(slate, llm, { system: "p" });
    for (const s of slate.filter((x) => x.forced)) {
      const g = games.find((x) => x.slot === s.slot)!;
      expect(g.themes).toEqual([...new Set([s.primaryTheme, ...s.forced!.extraThemes])]);
      expect(g.mechanics).toEqual(s.forced!.mechanics);
      expect(g.volatility).toBe(s.forced!.volatility);
      expect([g.minStake, g.maxStake, g.jackpotNetwork]).toEqual([0.2, 50, null]);
    }
    for (const c of BENCHMARK_CLUSTERS) {
      const members = slate.filter((s) => s.cluster === c.id && s.clusterRole === "member");
      expect(new Set(members.map((m) => games.find((g) => g.slot === m.slot)!.provider)).size).toBe(5);
    }
  });
});

describe("evaluation dimensions (spec 03 §6)", () => {
  const LABEL_KEYS = ["gameType", "qualityProfile", "series", "semanticCluster", "clusterRole", "volatilityBand", "marketProfile", "brandScope", "distribution", "trapTypes"];

  it("gives every reference entry exactly the 10 label keys", async () => {
    const { reference } = await offlineDataset();
    for (const r of reference) {
      expect(Object.keys(r.labels).sort()).toEqual([...LABEL_KEYS].sort());
      expect(r.labels.trapTypes).toEqual(r.specials);
      expect(r.labels.qualityProfile).toBe(r.profile);
      expect(["eu_only", "eu_and_nj", "nj_only", "none"]).toContain(r.labels.marketProfile);
      expect(["single_brand", "multi_brand"]).toContain(r.labels.brandScope);
      expect(["direct", "aggregated"]).toContain(r.labels.distribution);
    }
  });

  it("keeps cluster records rich or partial and free of traps (seasonal excepted)", async () => {
    const { reference } = await offlineDataset();
    const clustered = reference.filter((r) => r.labels.semanticCluster);
    expect(clustered).toHaveLength(28);
    for (const r of clustered) {
      expect(["rich", "partial"]).toContain(r.profile);
      expect(r.specials.every((s) => s === "seasonal")).toBe(true);
      expect(["member", "near_miss"]).toContain(r.labels.clusterRole);
    }
    expect(clustered.some((r) => r.profile === "partial")).toBe(true);
  });

  it("labels at least one record studio_aggregator_swap", async () => {
    const { reference } = await offlineDataset();
    expect(reference.filter((r) => r.labels.trapTypes.includes("studio_aggregator_swap")).length).toBeGreaterThanOrEqual(1);
  });

  it("summarises the dimensions in the manifest, naming every denominator", async () => {
    const { manifest, canonical, reference } = await offlineDataset();
    const dims = manifest.evaluation_dimensions as ReturnType<typeof evaluationDimensions>;
    expect(dims.note).toMatch(/^108 canonical games are represented by 113 feed records; the difference is duplicate exports and RTP variants/);
    expect(dims.perCanonicalGame.denominator).toBe(108);
    expect(dims.perFeedRecord.denominator).toBe(113);
    expect(dims.perCanonicalGame.benchmarkClusters).toEqual(
      BENCHMARK_CLUSTERS.map((c) => ({ id: c.id, label: c.label, members: 5, nearMisses: 2 })),
    );
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    for (const key of ["gameType", "volatility", "series", "marketProfile", "brandScope", "distribution"] as const) {
      expect(sum(dims.perCanonicalGame[key])).toBe(canonical.length);
    }
    expect(sum(dims.perFeedRecord.qualityProfile)).toBe(reference.length);
    expect(dims.perCanonicalGame.gameType).toEqual({ bingo: 5, instant_win: 7, live: 9, slot: 78, table: 9 });
  });
});

describe("trap games (spec 02 §4.1)", () => {
  const slate = buildSlate();
  const base = () => assembleCanonical(generateOffline(slate), slate);

  it("derives 2 market twins, 2 escalation twins, 3 lifecycle copies and 1 test build", () => {
    const input = base();
    const before = JSON.stringify(input);
    const t = addTrapGames(input);
    expect(JSON.stringify(input)).toBe(before); // the input catalogue isn't mutated
    expect(t.canonical).toHaveLength(108);
    expect([...t.specials.keys()]).toEqual(["g-101", "g-102", "g-103", "g-104", "g-105", "g-106", "g-107", "g-108"]);
    const kinds = [...t.specials.values()];
    expect(kinds.filter((k) => k === "market_twin")).toHaveLength(2);
    expect(kinds.filter((k) => k === "escalation_twin")).toHaveLength(2);
    expect(kinds.filter((k) => k.startsWith("lifecycle_"))).toHaveLength(3);
    expect(kinds.filter((k) => k === "test_game")).toHaveLength(1);
    expect(t.anchors.size).toBe(7);
  });

  it("builds each trap from a live standalone slot and keeps its themes", () => {
    const t = addTrapGames(base());
    const byId = (id: string) => t.canonical.find((g) => g.id === id)!;
    for (const anchorId of t.anchors) {
      const a = byId(anchorId);
      expect([a.gameType, a.status, a.benchmarkCluster]).toEqual(["slot", "active", null]);
    }
    for (const [trapId, anchorId] of t.anchorOf) expect(byId(trapId).themes).toEqual(byId(anchorId).themes);
  });

  it("market twins: the anchor is on liberty in GB and NJ; the twin is in the same family but not in NJ", () => {
    const t = addTrapGames(base());
    const byId = (id: string) => t.canonical.find((g) => g.id === id)!;
    for (const [trapId, kind] of t.specials) {
      if (kind !== "market_twin") continue;
      const twin = byId(trapId), anchor = byId(t.anchorOf.get(trapId)!);
      expect(anchor.markets).toEqual(expect.arrayContaining(["GB", "NJ"]));
      expect(anchor.brands).toContain("liberty");
      expect(twin.markets).not.toContain("NJ");
      expect(twin.brands).toEqual(anchor.brands);
      expect(twin.title).toBe(`${anchor.title} II`);
      expect(twin.seriesId).toBe(`${anchor.id}-family`);
      expect(anchor.seriesId).toBe(`${anchor.id}-family`);
    }
  });

  it("escalation twins: a gentle anchor in GB and ES, an extreme bonus-buy twin", () => {
    const t = addTrapGames(base());
    const byId = (id: string) => t.canonical.find((g) => g.id === id)!;
    for (const [trapId, kind] of t.specials) {
      if (kind !== "escalation_twin") continue;
      const twin = byId(trapId), anchor = byId(t.anchorOf.get(trapId)!);
      expect([anchor.volatility, anchor.minStake, anchor.maxStake]).toEqual(["low", 0.1, 5]);
      expect(anchor.maxWinMultiplier).toBeLessThanOrEqual(1000);
      expect(anchor.markets).toEqual(expect.arrayContaining(["GB", "ES"]));
      expect([twin.volatility, twin.minStake, twin.maxStake, twin.maxWinMultiplier]).toEqual(["extreme", 2, 500, 50000]);
      expect(twin.mechanics).toEqual([...new Set([...anchor.mechanics, "bonus_buy"])]);
      expect(twin.markets).toEqual(anchor.markets);
      expect(twin.title).toBe(`${anchor.title} Xtreme`);
      expect(twin.description).toBe(`${anchor.description} Extreme volatility with Bonus Buy to jump straight into the feature.`);
    }
  });

  it("lifecycle copies carry their status and suffix; the test build says it's live", () => {
    const t = addTrapGames(base());
    const byId = (id: string) => t.canonical.find((g) => g.id === id)!;
    const expected: Record<string, [string, string]> = {
      lifecycle_suspended: ["suspended", " Deluxe"],
      lifecycle_cert_expired: ["certification_expired", " Classic"],
      lifecycle_demo_only: ["demo_only", " Demo"],
    };
    const lifecycleAnchors: string[] = [];
    for (const [trapId, kind] of t.specials) {
      const g = byId(trapId), anchor = byId(t.anchorOf.get(trapId)!);
      const e = expected[kind];
      if (e) {
        expect(g.status).toBe(e[0]);
        expect(g.title).toBe(anchor.title + e[1]);
        expect([g.seriesId, g.benchmarkCluster]).toEqual([null, null]);
        lifecycleAnchors.push(anchor.id);
      }
      if (kind === "test_game") {
        expect([g.status, g.isTestGame]).toEqual(["active", true]);
        expect(g.title).toMatch(/^TEST_[A-Z0-9_]+_V2$/);
        expect(t.anchorOf.get(trapId)).toBe(lifecycleAnchors[0]); // a copy of the first lifecycle anchor
      }
    }
  });

  it("fails loudly when there are fewer than 7 live standalone slots", () => {
    const few = base().map((g, i) => (i < 95 ? { ...g, status: "withdrawn" as const } : g));
    expect(() => addTrapGames(few)).toThrow(/need at least 7 live standalone slots/);
  });
});

describe("trap games in the degraded feed (spec 02 §4.2)", () => {
  it("labels traps, opaque records and seasonal titles", async () => {
    const d = await offlineDataset();
    const all = d.reference.flatMap((r) => r.specials);
    expect(all).toContain("cryptic");
    expect(all).toContain("seasonal");
    for (const s of TRAP_SPECIALS) expect(all).toContain(s);
  });

  it("gives traps and anchors the rich profile, keeps anchors out of edge cases, and links traps to anchors", async () => {
    const d = await offlineDataset();
    const traps = d.reference.filter((r) => r.specials.some((s) => TRAP_SPECIALS.includes(s)));
    expect(traps).toHaveLength(8);
    const anchorIds = new Set(traps.map((r) => r.relatedTo));
    expect(anchorIds.size).toBe(7);
    for (const r of traps) {
      expect(r.profile).toBe("rich");
      expect(r.relatedTo).toMatch(/^g-\d{3}$/);
    }
    for (const r of d.reference.filter((x) => anchorIds.has(x.rawId))) {
      expect(r.profile).toBe("rich");
      expect(r.specials.every((s) => s === "seasonal")).toBe(true);
    }
  });

  it("emits lifecycle statuses, a test build without a test flag, and season months", async () => {
    const d = await offlineDataset();
    const rawFor = (special: Special) => rawById(d.raw, d.reference.find((r) => r.specials.includes(special))!.rawId);
    expect(rawFor("lifecycle_suspended").status).toBe("SUSPENDED");
    expect(rawFor("lifecycle_cert_expired").status).toBe("CERTIFICATION_EXPIRED");
    expect(rawFor("lifecycle_demo_only").status).toBe("DEMO_ONLY");
    for (const s of ["lifecycle_suspended", "lifecycle_cert_expired", "lifecycle_demo_only"] as const) expect(normaliseRecord(rawFor(s)).status).toBe("withdrawn");

    const testBuild = rawFor("test_game");
    expect(testBuild).not.toHaveProperty("is_test_game");
    expect(["live", "ACTIVE", "active"]).toContain(testBuild.status);
    expect(normaliseRecord(testBuild)).toMatchObject({ isTestGame: true, status: "active" });

    for (const g of d.canonical.filter((x) => x.seasonMonths)) {
      for (const r of d.reference.filter((x) => x.canonicalId === g.id)) expect(rawById(d.raw, r.rawId).available_months).toEqual(g.seasonMonths);
    }
    for (const r of d.reference.filter((x) => x.specials.includes("seasonal"))) {
      expect(normaliseRecord(rawById(d.raw, r.rawId)).seasonMonths).toEqual([1, 11, 12]);
    }
  });

  it("keeps market-twin licences and escalation-twin features through normalisation", async () => {
    const d = await offlineDataset();
    for (const r of d.reference.filter((x) => x.specials.includes("market_twin"))) {
      expect(normaliseRecord(rawById(d.raw, r.rawId)).markets).not.toContain("NJ");
      expect(normaliseRecord(rawById(d.raw, r.relatedTo!)).markets).toContain("NJ");
    }
    for (const r of d.reference.filter((x) => x.specials.includes("escalation_twin"))) {
      expect(normaliseRecord(rawById(d.raw, r.rawId)).mechanics).toContain("bonus_buy");
    }
  });
});
