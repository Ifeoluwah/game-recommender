import type { GameType, Mechanic } from "../domain/vocabulary.js";
import type { CreativeGame } from "./creative.js";
import { findRealNames } from "./real-names.js";
import type { SlateEntry } from "./slate.js";

/**
 * Checks and fixes for LLM generation output (spec 01 §6.2, "Repairs after generation"). The model is
 * asked to follow the rules; these make sure the catalogue does. The offline generator never goes
 * through them, so the reference dataset is unchanged.
 */

export type RepairKind = "title_studio" | "cluster_title" | "real_name" | "layout_regenerated" | "layout_cleared" | "live_dealer_removed";

/** One change made after the model answered, recorded in the manifest's `repairs`. */
export interface GenerationRepair {
  kind: RepairKind;
  slot: number;
  field: "title" | "reelLayout" | "mechanics";
  before: string | Mechanic[] | null;
  after: string | Mechanic[] | null;
  /** Single-slot calls it took, including failed ones; 0 for a deterministic fix. */
  attempts: number;
  /** Collision repairs: the earlier slot with the same title, and the studio involved. */
  collidedWithSlot?: number;
  provider?: string;
  /** Real-name repairs: the deny-list entries the old title matched. */
  realNames?: string[];
}

/** A problem that sends a slot back to the model. */
export interface SlotProblem {
  kind: "title_studio" | "cluster_title" | "real_name" | "layout";
  /** The slot that gets regenerated: for a collision, the later one in slate order. */
  slot: number;
  /** For a collision, the earlier slot it repeats. */
  otherSlot: number | null;
  message: string;
  /** An extra line for the single-slot request, saying what was wrong. */
  instruction: string | null;
  /** For a real-name problem, the deny-list entries matched. */
  realNames?: string[];
}

export interface TitleCollision {
  /** The later slot, in slate order: the one that gets regenerated. */
  slot: number;
  /** The first slot with this title (and studio). */
  firstSlot: number;
  title: string;
  provider: string;
}

/** Case, spacing and punctuation don't make two titles different. */
export const titleKey = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]/g, "");

function collisions(games: readonly CreativeGame[], key: (g: CreativeGame) => string | null): TitleCollision[] {
  const seen = new Map<string, number>();
  const out: TitleCollision[] = [];
  for (const g of games) {
    const k = key(g);
    if (k === null) continue;
    const first = seen.get(k);
    if (first !== undefined) out.push({ slot: g.slot, firstSlot: first, title: g.title, provider: g.provider });
    else seen.set(k, g.slot);
  }
  return out;
}

/** Every slot whose title and studio repeat an earlier slot's, in order. */
export const findTitleStudioCollisions = (games: readonly CreativeGame[]): TitleCollision[] =>
  collisions(games, (g) => `${titleKey(g.title)}|${g.provider}`);

/** Every benchmark-cluster slot whose title repeats an earlier cluster slot's, whatever the studio. */
export function findClusterTitleCollisions(games: readonly CreativeGame[], slate: readonly SlateEntry[]): TitleCollision[] {
  const clustered = new Set(slate.filter((s) => s.cluster).map((s) => s.slot));
  return collisions(games, (g) => (clustered.has(g.slot) ? titleKey(g.title) : null));
}

export const duplicateMessage = (c: TitleCollision): string =>
  `duplicate title and studio: "${c.title}" by ${c.provider} (slots ${c.firstSlot} and ${c.slot})`;

/**
 * Title and studio together identify a game (they form the dedupe key), so a repeat would merge two
 * unrelated games. The same title from different studios is allowed. This is the final check for
 * both paths; the LLM path has already repaired what it could.
 */
export function assertUniqueTitleStudio(games: readonly CreativeGame[]): void {
  const [collision] = findTitleStudioCollisions(games);
  if (collision) throw new Error(duplicateMessage(collision));
}

// --- Layout fit ---

const GRID = /\d+\s*[x×]\s*\d+/i;
/** Win lines or ways, which a slot layout must state (spec 01 §6.2), and which only a slot can have. */
const SLOT_WINS = /\b(lines?|paylines?|ways|megaways|cluster)\b/i;
const REEL_WORDS = /\b(reels?|lines?|paylines?|ways|megaways|cluster)\b/i;
/** What a real layout looks like for each non-slot type; anything else is a placeholder. */
const NON_SLOT_LAYOUT: Record<Exclude<GameType, "slot">, RegExp> = {
  table: /\b(wheel|shoe|deck|table|felt|zero)\b/i,
  live: /\b(wheel|shoe|deck|table|zero)\b/i,
  instant_win: /\b(scratch|grid|tiles?|panels?)\b/i,
  bingo: /\bball\b/i,
};

export type LayoutFit = "fits" | "contradicts" | "placeholder";

/**
 * - A slot needs a grid and win lines or ways ("5x3, 20 lines", "6x7 Megaways"); anything else
 *   contradicts it, including a missing layout.
 * - On a non-slot, reels, lines, ways or Megaways (or a bare reel grid) contradict the type. An
 *   instant win's "3x3 scratch grid" is fine.
 * - A non-slot layout that describes no board for its type ("live dealer", "live studio setting",
 *   empty) is a placeholder.
 */
export function layoutFit(gameType: GameType, layout: string | null): LayoutFit {
  const l = (layout ?? "").trim();
  if (gameType === "slot") return l && GRID.test(l) && SLOT_WINS.test(l) ? "fits" : "contradicts";
  if (!l) return "placeholder";
  if (REEL_WORDS.test(l) || (gameType !== "instant_win" && GRID.test(l))) return "contradicts";
  return NON_SLOT_LAYOUT[gameType].test(l) ? "fits" : "placeholder";
}

// --- What goes back to the model, and what is fixed in code ---

const typeOf = (slate: readonly SlateEntry[], slot: number): GameType => {
  const s = slate.find((x) => x.slot === slot);
  if (!s) throw new Error(`no slate entry for slot ${slot}`);
  return s.gameType;
};

/** Problems that need the model again: title collisions, cluster-title repeats, real-world names, contradicting layouts. */
export function findRegenerationProblems(games: readonly CreativeGame[], slate: readonly SlateEntry[]): SlotProblem[] {
  const problems: SlotProblem[] = [
    ...findTitleStudioCollisions(games).map((c): SlotProblem => ({ kind: "title_studio", slot: c.slot, otherSlot: c.firstSlot, message: duplicateMessage(c), instruction: null })),
    ...findClusterTitleCollisions(games, slate).map((c): SlotProblem => ({
      kind: "cluster_title",
      slot: c.slot,
      otherSlot: c.firstSlot,
      message: `duplicate title among benchmark-cluster games: "${c.title}" (slots ${c.firstSlot} and ${c.slot})`,
      instruction: null,
    })),
  ];
  for (const g of games) {
    const realNames = findRealNames(g.title);
    if (realNames.length) {
      const quoted = realNames.map((n) => JSON.stringify(n)).join(", ");
      problems.push({
        kind: "real_name",
        slot: g.slot,
        otherSlot: null,
        message: `title ${JSON.stringify(g.title)} uses a real-world name (${quoted}) (slot ${g.slot})`,
        instruction: `The previous title ${JSON.stringify(g.title)} uses a real-world name (${quoted}). Use an invented title: no real brand, game, franchise, film or TV title.`,
        realNames,
      });
    }
    const type = typeOf(slate, g.slot);
    if (layoutFit(type, g.reelLayout) === "contradicts") {
      problems.push({
        kind: "layout",
        slot: g.slot,
        otherSlot: null,
        message: `reelLayout ${JSON.stringify(g.reelLayout)} doesn't fit type=${type} (slot ${g.slot})`,
        instruction: `The previous reelLayout ${JSON.stringify(g.reelLayout ?? "")} does not fit type=${type}. Use a reelLayout that fits it.`,
      });
    }
  }
  return problems;
}

/** Does this slot still have a problem, on either side of a collision? */
export const involves = (problems: readonly SlotProblem[], slot: number): boolean => problems.some((p) => p.slot === slot || p.otherSlot === slot);

/**
 * Fixes that need no model: `live_dealer` comes off non-live games, and a placeholder layout on a
 * non-slot becomes null. Runs after the regeneration loop, on the games that will be kept.
 */
export function applyDeterministicFixes(games: readonly CreativeGame[], slate: readonly SlateEntry[]): { games: CreativeGame[]; repairs: GenerationRepair[] } {
  const repairs: GenerationRepair[] = [];
  const fixed = games.map((g) => {
    const type = typeOf(slate, g.slot);
    let next = g;
    if (type !== "live" && g.mechanics.includes("live_dealer")) {
      next = { ...next, mechanics: next.mechanics.filter((m) => m !== "live_dealer") };
      repairs.push({ kind: "live_dealer_removed", slot: g.slot, field: "mechanics", before: g.mechanics, after: next.mechanics, attempts: 0 });
    }
    if (type !== "slot" && g.reelLayout !== null && layoutFit(type, g.reelLayout) === "placeholder") {
      next = { ...next, reelLayout: null };
      repairs.push({ kind: "layout_cleared", slot: g.slot, field: "reelLayout", before: g.reelLayout, after: null, attempts: 0 });
    }
    return next;
  });
  return { games: fixed, repairs };
}
