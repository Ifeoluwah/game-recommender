import { describe, expect, it } from "vitest";
import {
  cleanText,
  cleanTitle,
  dedupeTitle,
  normaliseGameType,
  normaliseMaxWin,
  normaliseMonths,
  normaliseProvider,
  normaliseRecord,
  normaliseRtp,
  normaliseStake,
  normaliseVolatility,
  normaliseYear,
  parseSpecs,
  parseTags,
  resolveStudio,
} from "../src/pipeline/normalise.js";
import type { RawRecord } from "../src/domain/types.js";

const base: RawRecord = {
  game_id: "g-001",
  name: "Gold Rush",
  studio: "Kestrel Play",
  brands: ["aurora"],
  markets: ["GB"],
  status: "live",
  rtp: 96.2,
};

describe("normaliseRtp", () => {
  it.each([
    [96.21, 96.21],
    ["96.21%", 96.21],
    ["0.9621", 96.21],
    ["96,21", 96.21],
    [" 95.5 % ", 95.5],
  ])("%j → %j", (input, expected) => expect(normaliseRtp(input)).toBe(expected));

  it.each([[84], [100], ["abc"], [null], [undefined], [""]])("rejects %j rather than guessing", (input) => expect(normaliseRtp(input)).toBeNull());
});

describe("normaliseStake", () => {
  it.each([
    [100, 100],
    ["£100", 100],
    ["100.00", 100],
    ["10p", 0.1],
    ["£0.10", 0.1],
    ["1,000", 1000],
    [0.2, 0.2],
  ])("%j → %j", (input, expected) => expect(normaliseStake(input)).toBe(expected));

  it.each([[0], ["free"], [null], [-5], [200_000]])("rejects %j", (input) => expect(normaliseStake(input)).toBeNull());
});

describe("normaliseVolatility", () => {
  it.each([
    ["Med", "medium"],
    ["MEDIUM", "medium"],
    ["3/5", "medium"],
    ["HIGH", "high"],
    ["4/5", "high"],
    ["Very High", "extreme"],
    ["EXTREME", "extreme"],
    ["5/5", "extreme"],
    ["L", "low"],
    ["Low", "low"],
    ["1/5", "low"],
    ["2/5", "low"],
  ])("%j → %s", (input, expected) => expect(normaliseVolatility(input)).toBe(expected));

  it.each([["banana"], [""], [null]])("unknown %j → null", (input) => expect(normaliseVolatility(input)).toBeNull());
});

describe("normaliseGameType", () => {
  it.each([
    ["Slots", "slot"], ["slot", "slot"], ["Video Slot", "slot"], ["VIDEO SLOTS", "slot"],
    ["Table Games", "table"], ["table", "table"], ["Blackjack/Roulette", "table"],
    ["Live Casino", "live"], ["live dealer", "live"], ["LIVE", "live"],
    ["Instant Win", "instant_win"], ["Scratchcards", "instant_win"], ["instant", "instant_win"],
    ["Bingo", "bingo"], ["bingo rooms", "bingo"],
  ])("category %j → %s", (input, expected) => expect(normaliseGameType(input)).toBe(expected));

  it("unrecognised or missing → null", () => {
    expect(normaliseGameType("Lottery")).toBeNull();
    expect(normaliseGameType(undefined)).toBeNull();
  });
});

describe("normaliseProvider and resolveStudio", () => {
  it.each([["Kestrel Play"], ["KESTREL PLAY"], ["kestrel play"], ["Kestrel Play Ltd"], ["KestrelPlay"]])("studio variant %j → canonical name", (input) =>
    expect(normaliseProvider(input)).toBe("Kestrel Play"),
  );

  it.each([["Unknown"], ["N/A"], ["tbc"], [""], [null]])("%j means missing", (input) => expect(normaliseProvider(input)).toBeNull());

  it("keeps an unrecognised studio name as given", () => expect(normaliseProvider("Brand New Studio")).toBe("Brand New Studio"));

  it("repairs studio and aggregator swapped", () => {
    expect(resolveStudio("Nexus Distribution", "Lumen Studios")).toEqual({ studio: "Lumen Studios", aggregator: "Nexus Distribution" });
    expect(resolveStudio("PRISM GAMES HUB", "lumen studios ltd")).toEqual({ studio: "Lumen Studios", aggregator: "Prism Games Hub" });
  });

  it("treats an aggregator alone in the studio field as an unknown studio", () => {
    expect(resolveStudio("NEXUS DISTRIBUTION", undefined)).toEqual({ studio: null, aggregator: "Nexus Distribution" });
  });

  it("canonicalises the aggregator field", () => {
    expect(resolveStudio("Lumen Studios", "PRISM GAMES HUB")).toEqual({ studio: "Lumen Studios", aggregator: "Prism Games Hub" });
  });

  it("records an issue when the swap is repaired", () => {
    const g = normaliseRecord({ ...base, studio: "Nexus Distribution", aggregator: "Kestrel Play" });
    expect(g.provider).toBe("Kestrel Play");
    expect(g.aggregator).toBe("Nexus Distribution");
    expect(g.issues).toContain("studio_aggregator_repaired");
  });
});

describe("parseTags", () => {
  it("maps an array through the synonyms", () => {
    const t = parseTags(["Ancient Egypt", "Free Spins", "Tumbling Reels", "Vikings", "Feature Buy"]);
    expect(t.themes).toEqual(["egyptian", "nordic"]);
    expect(t.mechanics).toEqual(["free_spins", "cascading_reels", "bonus_buy"]);
    expect(t.unknown).toEqual([]);
  });

  it.each([["egypt;Hold & Win|🔥 HOT"], ["egypt, Hold & Win, 🔥 HOT"], ["egypt|Hold & Win;🔥 HOT"]])("splits %j on ; , |", (input) => {
    const t = parseTags(input);
    expect(t.themes).toEqual(["egyptian"]);
    expect(t.mechanics).toEqual(["hold_and_win"]);
    expect(t.unknown).toEqual(["🔥 HOT"]);
  });

  it("accepts vocabulary terms written with spaces", () => {
    expect(parseTags(["scratch card", "game show", "cash collect"])).toMatchObject({ themes: ["game_show"], mechanics: ["scratch_card", "cash_collect"] });
  });

  it("keeps unrecognised tags, junk included", () => {
    expect(parseTags(["new!!", "Top 10", "exclusive"]).unknown).toEqual(["new!!", "Top 10", "exclusive"]);
  });

  it("reads coarse type and volatility tags as hints", () => {
    const t = parseTags(["Slots", "High Volatility", "Leprechaun"]);
    expect(t.gameTypeHint).toBe("slot");
    expect(t.volatilityHint).toBe("high");
    expect(t.themes).toEqual(["irish"]);
    expect(parseTags(["Very High Volatility"]).volatilityHint).toBe("extreme");
    expect(parseTags(["Instant Win"]).gameTypeHint).toBe("instant_win");
  });

  it("returns nothing for a missing or non-list value", () => {
    expect(parseTags(undefined)).toEqual({ themes: [], mechanics: [], unknown: [], gameTypeHint: null, volatilityHint: null });
  });
});

describe("parseSpecs", () => {
  it.each([
    [{ reels: "5x3, 20 lines", max_win: "5,000x", jackpot: "CROWN JACKPOTS" }],
    [{ layout: "5x3, 20 lines", maxWin: "x5000", jackpot_network: "Crown Jackpots" }],
    [{ grid: "5x3, 20 lines", max_win: 5000, jackpot: "crown jackpots" }],
  ])("reads the nested blob %j", (specs) => {
    expect(parseSpecs({ specs })).toEqual({ reelLayout: "5x3, 20 lines", maxWin: 5000, jackpotNetwork: "Crown Jackpots" });
  });

  it("reads flat columns", () => {
    expect(parseSpecs({ reel_layout: "6x7 Megaways, 117,649 ways", max_win_multiplier: "10,000x", jackpot_network: "STARFALL NETWORK" })).toEqual({
      reelLayout: "6x7 Megaways, 117,649 ways",
      maxWin: 10000,
      jackpotNetwork: "Starfall Network",
    });
  });

  it("gives nulls when there are no specs", () => {
    expect(parseSpecs({})).toEqual({ reelLayout: null, maxWin: null, jackpotNetwork: null });
  });
});

describe("normaliseMaxWin", () => {
  it.each([["5,000x", 5000], ["x5000", 5000], [5000, 5000], ["50x", 50]])("%j → %j", (input, expected) => expect(normaliseMaxWin(input)).toBe(expected));
  it.each([["5x"], ["2,000,000x"], ["huge"], [null]])("implausible or unreadable %j → null", (input) => expect(normaliseMaxWin(input)).toBeNull());
});

describe("normaliseYear, cleanText, cleanTitle", () => {
  it.each([["2019", 2019], ["2019-03-01", 2019], [2019, 2019]])("release %j → %j", (input, expected) => expect(normaliseYear(input)).toBe(expected));
  it.each([["1985"], ["soon"], [null]])("release %j → null", (input) => expect(normaliseYear(input)).toBeNull());

  it("strips HTML, entities and extra spaces from text", () => {
    expect(cleanText("<p>Spin &amp;  win</p>")).toBe("Spin & win");
  });

  it("strips ™®© and spacing from titles", () => {
    expect(cleanTitle("  Gold Rush™ ")).toBe("Gold Rush");
    expect(cleanTitle("<b>Gold</b> Rush®")).toBe("Gold Rush");
  });
});

describe("dedupe key", () => {
  it("strips an explicit RTP percentage always", () => {
    expect(dedupeTitle("Gold Rush (94.1%)", 94.1)).toBe("goldrush");
    expect(dedupeTitle("Gold Rush 94%", null)).toBe("goldrush");
  });

  it("strips a bare trailing number only when it matches the record's RTP", () => {
    expect(dedupeTitle("Gold Rush 94", 94.1)).toBe("goldrush");
    expect(dedupeTitle("Lucky 88", 96.5)).toBe("lucky88");
    expect(dedupeTitle("Lucky 88", null)).toBe("lucky88");
  });

  it("gives RTP variants the original's key, and keeps 'Lucky 88' distinct", () => {
    const original = normaliseRecord(base);
    const bare = normaliseRecord({ ...base, game_id: "g-001-rtp94", name: "Gold Rush 94", rtp: "94.1%" });
    const pct = normaliseRecord({ ...base, game_id: "g-001-rtp94", name: "Gold Rush (94.1%)", rtp: "94.1%" });
    expect(bare.dedupeKey).toBe(original.dedupeKey);
    expect(pct.dedupeKey).toBe(original.dedupeKey);
    expect(normaliseRecord({ ...base, name: "Lucky 88" }).dedupeKey).toBe("lucky88|kestrelplay");
  });

  it("matches a duplicate export with an uppercase name and studio variant", () => {
    const dup = normaliseRecord({ ...base, game_id: "g-001-cms2", name: "GOLD RUSH ", studio: "KESTREL PLAY LTD" });
    expect(dup.dedupeKey).toBe(normaliseRecord(base).dedupeKey);
  });
});

describe("fail-closed eligibility", () => {
  it("missing markets → available nowhere", () => {
    const { markets, ...rest } = base;
    const g = normaliseRecord(rest);
    expect(g.markets).toEqual([]);
    expect(g.issues).toContain("markets_missing_fail_closed");
  });

  it("reads 'UK;SE' as GB and SE", () => {
    expect(normaliseRecord({ ...base, markets: "UK;SE" }).markets).toEqual(["GB", "SE"]);
  });

  it("drops unknown brands", () => {
    const g = normaliseRecord({ ...base, brands: "aurora,acme" });
    expect(g.brands).toEqual(["aurora"]);
    expect(g.issues).toContain("unknown_brand_dropped");
  });

  it.each([["live"], ["ACTIVE"], ["active"], ["Enabled"]])("status %j is live", (status) => expect(normaliseRecord({ ...base, status }).status).toBe("active"));

  it.each([["disabled"], ["withdrawn"], ["maintenance"], ["SUSPENDED"], ["CERTIFICATION_EXPIRED"], ["DEMO_ONLY"], ["coming soon"]])(
    "status %j is not live",
    (status) => {
      const g = normaliseRecord({ ...base, status });
      expect(g.status).toBe("withdrawn");
      expect(g.issues).toContain(`status_not_live:${status.toLowerCase()}`);
    },
  );

  it("missing status is not live", () => {
    const { status, ...rest } = base;
    const g = normaliseRecord(rest);
    expect(g.status).toBe("withdrawn");
    expect(g.issues).toContain("status_missing_fail_closed");
  });

  it.each([[true], ["Y"], ["yes"], ["1"], ["TRUE"]])("test flag %j marks a test build", (flag) => expect(normaliseRecord({ ...base, is_test_game: flag }).isTestGame).toBe(true));

  it.each([["TEST_GOLD_RUSH_V2"], ["QA build 3"], ["dev-gold-rush"]])("title %j marks a test build", (name) => expect(normaliseRecord({ ...base, name }).isTestGame).toBe(true));

  it.each([["Testament of Ra"], ["Developer's Dream"]])("title %j is not a test build", (name) => expect(normaliseRecord({ ...base, name }).isTestGame).toBe(false));

  it("rejects a record without an id", () => {
    expect(() => normaliseRecord({ name: "x" })).toThrow(/game_id/);
  });
});

describe("season months", () => {
  it("absent → all year", () => expect(normaliseMonths(undefined)).toBeNull());
  it("present → sorted unique months", () => expect(normaliseMonths([12, 11, 1, 1])).toEqual([1, 11, 12]));
  it("unreadable → never in season, with an issue", () => {
    expect(normaliseMonths("winter")).toEqual([]);
    expect(normaliseMonths([13, 0])).toEqual([]);
    expect(normaliseRecord({ ...base, available_months: "winter" }).issues).toContain("season_unreadable");
  });
});

describe("sourceHash", () => {
  it("ignores key order and changes with content", () => {
    const a = normaliseRecord(base).sourceHash;
    const reordered = normaliseRecord(Object.fromEntries(Object.entries(base).reverse())).sourceHash;
    expect(reordered).toBe(a);
    expect(normaliseRecord({ ...base, rtp: 95 }).sourceHash).not.toBe(a);
  });
});
