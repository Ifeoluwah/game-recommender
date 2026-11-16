import type { CanonicalGame } from "../src/domain/types.js";
import type { Mechanic } from "../src/domain/vocabulary.js";

/**
 * Silver relevance labels (spec 06 §3, appendix A11 verbatim). A rule standing in for a curator,
 * computed from the CLEAN canonical records the system never saw. Good for comparing variants and
 * catching regressions; not a substitute for a human-labelled golden set before launch.
 */

const GENERIC_MECHANICS = new Set<Mechanic>(["free_spins", "fixed_paylines", "multipliers"]);

export function relevance(a: CanonicalGame, b: CanonicalGame): 0 | 1 | 2 | 3 {
  if (a.seriesId && a.seriesId === b.seriesId) return 3;
  const sameType = a.gameType === b.gameType;
  const themeOverlap = a.themes.filter((t) => b.themes.includes(t)).length;
  const mechOverlap = a.mechanics.filter((m) => !GENERIC_MECHANICS.has(m) && b.mechanics.includes(m)).length;
  if (sameType && themeOverlap >= 1 && (mechOverlap >= 1 || a.volatility === b.volatility)) return 2;
  if (sameType && a.jackpotNetwork && a.jackpotNetwork === b.jackpotNetwork) return 2;
  if (sameType && (themeOverlap >= 1 || mechOverlap >= 2 || a.gameType !== "slot")) return 1;
  const tableFamily = (t: string) => t === "table" || t === "live";
  if (tableFamily(a.gameType) && tableFamily(b.gameType) && themeOverlap >= 1) return 1;
  return 0;
}

export function dcg(grades: number[]): number {
  return grades.reduce((s, g, i) => s + (2 ** g - 1) / Math.log2(i + 2), 0);
}

export function ndcgAtK(returned: number[], idealPool: number[], k: number): number {
  const ideal = dcg([...idealPool].sort((x, y) => y - x).slice(0, k));
  return ideal === 0 ? 0 : dcg(returned.slice(0, k)) / ideal;
}
