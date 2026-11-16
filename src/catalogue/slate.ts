import { pick, seededRandom } from "../util/misc.js";
import type { GameType, Mechanic, Theme, Volatility } from "../domain/vocabulary.js";

export interface SlateEntry {
  slot: number;
  gameType: GameType;
  primaryTheme: Theme;
  seriesName: string | null;
  /** Trap: a non-slot game whose title sounds like a slot ("... Megaways"). Title-only matching gets it wrong. */
  misleadingTitle: boolean;
  /** Benchmark cluster membership (evaluation design). Attributes in `forced` are enforced after generation. */
  cluster: string | null;
  clusterRole: "member" | "near_miss" | null;
  forced: { mechanics: Mechanic[]; volatility: Volatility; extraThemes: Theme[] } | null;
}

/**
 * Benchmark clusters: deliberately designed ground truth for ranking quality, planted inside the
 * otherwise seeded-random catalogue. Each has 5 members that should recommend each other, and 2
 * near-misses that share the theme but differ in game type or mechanics, and should rank BELOW
 * the members. Near-misses test whether matching understands more than the theme word.
 */
interface ClusterSpec {
  id: string;
  label: string;
  theme: Theme;
  member: { gameType: GameType; mechanics: Mechanic[]; volatility: Volatility[]; extraThemes?: Theme[] };
  nearMisses: Array<{ gameType: GameType; mechanics: Mechanic[]; volatility: Volatility; extraThemes?: Theme[] }>;
}

export const BENCHMARK_CLUSTERS: ClusterSpec[] = [
  {
    id: "egyptian_cascade", label: "Egyptian cascading-reel slots, high volatility", theme: "egyptian",
    member: { gameType: "slot", mechanics: ["cascading_reels", "multipliers"], volatility: ["high"] },
    nearMisses: [
      { gameType: "instant_win", mechanics: ["scratch_card"], volatility: "low" },
      { gameType: "slot", mechanics: ["fixed_paylines"], volatility: "low", extraThemes: ["classic"] },
    ],
  },
  {
    id: "fishing_cash_collect", label: "Fishing slots with cash collect, medium/high volatility", theme: "fishing",
    member: { gameType: "slot", mechanics: ["cash_collect", "free_spins"], volatility: ["medium", "high"], extraThemes: ["underwater"] },
    nearMisses: [
      { gameType: "instant_win", mechanics: ["scratch_card"], volatility: "low" },
      { gameType: "bingo", mechanics: ["pick_bonus"], volatility: "low" },
    ],
  },
  {
    id: "classic_fruit", label: "Classic fruit slots, low volatility", theme: "fruit",
    member: { gameType: "slot", mechanics: ["fixed_paylines"], volatility: ["low"], extraThemes: ["classic"] },
    nearMisses: [
      { gameType: "slot", mechanics: ["megaways", "cascading_reels"], volatility: "high" },
      { gameType: "slot", mechanics: ["megaways", "bonus_buy"], volatility: "extreme" },
    ],
  },
  {
    id: "live_game_show", label: "Live game shows with a bonus wheel", theme: "game_show",
    member: { gameType: "live", mechanics: ["wheel_bonus", "multipliers", "live_dealer"], volatility: ["medium"] },
    nearMisses: [
      { gameType: "live", mechanics: ["live_dealer"], volatility: "low", extraThemes: ["roulette"] },
      { gameType: "live", mechanics: ["live_dealer", "side_bets"], volatility: "low", extraThemes: ["cards"] },
    ],
  },
];

const SLOT_THEMES: Theme[] = [
  "egyptian", "mythology", "adventure", "fruit", "classic", "animals", "fantasy", "horror",
  "irish", "asian", "sports", "music", "space", "pirates", "western", "gems", "candy",
  "underwater", "festive", "wealth", "nordic", "aztec", "fishing",
];

const SERIES: Array<{ name: string; theme: Theme; size: number }> = [
  { name: "Sands of Khepri", theme: "egyptian", size: 3 },
  { name: "Thunder Halls", theme: "nordic", size: 2 },
  { name: "Lucky Clover Lane", theme: "irish", size: 3 },
  { name: "Deep Reef", theme: "underwater", size: 2 },
  { name: "Gilded Dragon", theme: "asian", size: 3 },
  { name: "Cosmic Drift", theme: "space", size: 2 },
  { name: "Orchard Classics", theme: "fruit", size: 3 },
  { name: "Bandit Ridge", theme: "western", size: 2 },
];

type Draft = Omit<SlateEntry, "slot">;
const plain = (gameType: GameType, primaryTheme: Theme, extra: Partial<Draft> = {}): Draft => ({
  gameType, primaryTheme, seriesName: null, misleadingTitle: false, cluster: null, clusterRole: null, forced: null, ...extra,
});

export function buildSlate(seed = 42, total = 100): SlateEntry[] {
  const rand = seededRandom(seed);
  const entries: Draft[] = [];
  for (const s of SERIES) for (let i = 0; i < s.size; i++) entries.push(plain("slot", s.theme, { seriesName: s.name }));
  for (const c of BENCHMARK_CLUSTERS) {
    for (let i = 0; i < 5; i++) {
      const volatility = c.member.volatility[i % c.member.volatility.length]!;
      entries.push(plain(c.member.gameType, c.theme, { cluster: c.id, clusterRole: "member", forced: { mechanics: c.member.mechanics, volatility, extraThemes: c.member.extraThemes ?? [] } }));
    }
    for (const nm of c.nearMisses) {
      entries.push(plain(nm.gameType, c.theme, { cluster: c.id, clusterRole: "near_miss", forced: { mechanics: nm.mechanics, volatility: nm.volatility, extraThemes: nm.extraThemes ?? [] } }));
    }
  }
  // The rest of the catalogue keeps an organic, seeded-random spread.
  const fixed: Array<[GameType, Theme[], number]> = [
    ["table", ["cards", "roulette"], 9],
    ["live", ["cards", "roulette"], 2],
    ["instant_win", ["gems", "wealth", "fruit", "festive"], 5],
    ["bingo", ["classic", "festive", "music"], 4],
  ];
  for (const [gameType, themes, n] of fixed) {
    // The first two instant-win games get slot-sounding titles.
    for (let i = 0; i < n; i++) entries.push(plain(gameType, pick(rand, themes), { misleadingTitle: gameType === "instant_win" && i < 2 }));
  }
  while (entries.length < total) entries.push(plain("slot", pick(rand, SLOT_THEMES)));
  // Shuffle so series and cluster members are not adjacent (generation batches then mix them).
  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [entries[i], entries[j]] = [entries[j]!, entries[i]!];
  }
  return entries.slice(0, total).map((e, i) => ({ ...e, slot: i + 1 }));
}
