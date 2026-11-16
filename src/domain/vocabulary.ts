export const GAME_TYPES = ["slot", "table", "live", "instant_win", "bingo"] as const;
export const VOLATILITIES = ["low", "medium", "high", "extreme"] as const;
/** Ordinal risk level, used by the recommendation policy to stop escalation. */
export const VOLATILITY_RANK: Record<(typeof VOLATILITIES)[number], number> = { low: 0, medium: 1, high: 2, extreme: 3 };

export const THEMES = [
  "egyptian", "mythology", "adventure", "fruit", "classic", "animals", "fantasy",
  "horror", "irish", "asian", "sports", "music", "space", "pirates", "western",
  "gems", "candy", "underwater", "festive", "wealth", "nordic", "aztec",
  "cards", "roulette", "game_show", "fishing",
] as const;

export const MECHANICS = [
  "megaways", "cluster_pays", "hold_and_win", "free_spins", "cascading_reels",
  "progressive_jackpot", "expanding_wilds", "multipliers", "pick_bonus",
  "sticky_wilds", "live_dealer", "side_bets", "fixed_paylines", "scratch_card",
  "wheel_bonus", "bonus_buy", "cash_collect",
] as const;

/** GB/ES/SE/NL are European licences; NJ stands in for a US state licence with its own brand. */
export const MARKETS = ["GB", "ES", "SE", "NL", "NJ"] as const;

/** Fictional providers, so the exercise never imitates real studios. */
export const PROVIDERS = [
  "Lumen Studios", "Redwater Gaming", "Northlight Interactive",
  "Kestrel Play", "Bramble Games", "Orbital Reels",
] as const;

/**
 * Fictional aggregators. Aggregators distribute games built by studios, and upstream feeds often
 * put the aggregator's name in the studio field. The studio (PROVIDERS) is what identifies a game.
 */
export const AGGREGATORS = ["Nexus Distribution", "Prism Games Hub"] as const;

/** Fictional jackpot networks (shared progressive pools across games). */
export const JACKPOT_NETWORKS = ["Crown Jackpots", "Daily Vault", "Starfall Network"] as const;

export type GameType = (typeof GAME_TYPES)[number];
export type Volatility = (typeof VOLATILITIES)[number];
export type Theme = (typeof THEMES)[number];
export type Mechanic = (typeof MECHANICS)[number];
export type Market = (typeof MARKETS)[number];

export const isGameType = (v: unknown): v is GameType => GAME_TYPES.includes(v as GameType);
export const isVolatility = (v: unknown): v is Volatility => VOLATILITIES.includes(v as Volatility);
export const isTheme = (v: unknown): v is Theme => THEMES.includes(v as Theme);
export const isMechanic = (v: unknown): v is Mechanic => MECHANICS.includes(v as Mechanic);
export const isMarket = (v: unknown): v is Market => MARKETS.includes(v as Market);

/** Source-system tag spellings mapped onto the controlled vocabulary. */
export const TAG_SYNONYMS: Record<string, Theme | Mechanic> = {
  egypt: "egyptian", "ancient egypt": "egyptian", pharaoh: "egyptian", pyramids: "egyptian",
  myth: "mythology", gods: "mythology", greek: "mythology",
  fruits: "fruit", "fruit machine": "fruit", retro: "classic", "classic slot": "classic",
  animal: "animals", wildlife: "animals", magic: "fantasy", dragons: "fantasy",
  spooky: "horror", halloween: "horror", luck: "irish", leprechaun: "irish", celtic: "irish",
  oriental: "asian", chinese: "asian", football: "sports", rock: "music",
  "sci-fi": "space", scifi: "space", pirate: "pirates", "wild west": "western", cowboys: "western",
  jewels: "gems", sweets: "candy", ocean: "underwater", sea: "underwater",
  christmas: "festive", xmas: "festive", gold: "wealth", riches: "wealth", vikings: "nordic", viking: "nordic",
  mayan: "aztec", blackjack: "cards", baccarat: "cards", poker: "cards", "game show": "game_show",
  "free spins": "free_spins", fs: "free_spins", freespins: "free_spins",
  "hold & win": "hold_and_win", "hold and win": "hold_and_win", "hold&win": "hold_and_win",
  "cluster pays": "cluster_pays", cascade: "cascading_reels", cascades: "cascading_reels",
  "tumbling reels": "cascading_reels", jackpot: "progressive_jackpot", progressive: "progressive_jackpot",
  "expanding wilds": "expanding_wilds", multiplier: "multipliers", "pick & click": "pick_bonus",
  "pick bonus": "pick_bonus", "sticky wilds": "sticky_wilds", "live dealer": "live_dealer",
  fish: "fishing", fisherman: "fishing", angler: "fishing", angling: "fishing",
  "cash collect": "cash_collect", "money collect": "cash_collect", "coin collect": "cash_collect",
  "side bets": "side_bets", paylines: "fixed_paylines", "bonus buy": "bonus_buy", "feature buy": "bonus_buy", "buy bonus": "bonus_buy", scratchcard: "scratch_card", scratch: "scratch_card",
  "bonus wheel": "wheel_bonus", wheel: "wheel_bonus",
};
