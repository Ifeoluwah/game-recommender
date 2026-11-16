import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { PROMPTS_DIR } from "../config.js";
import type { JsonLlm } from "../ai/providers.js";
import { JACKPOT_NETWORKS, MECHANICS, PROVIDERS, THEMES, VOLATILITIES } from "../domain/vocabulary.js";
import type { GameType, Mechanic, Theme, Volatility } from "../domain/vocabulary.js";
import { pick, round, sampleN, seededRandom, withRetry } from "../util/misc.js";
import type { RetryOptions } from "../util/misc.js";
import { applyDeterministicFixes, findRegenerationProblems, involves } from "./repairs.js";
import type { GenerationRepair, RepairKind, SlotProblem } from "./repairs.js";
import type { SlateEntry } from "./slate.js";

export { assertUniqueTitleStudio, findTitleStudioCollisions } from "./repairs.js";
export type { GenerationRepair } from "./repairs.js";

/** The creative (non-operational) half of a game: what the LLM, or the offline stand-in, writes. */
export interface CreativeGame {
  slot: number;
  title: string;
  provider: string;
  themes: Theme[];
  mechanics: Mechanic[];
  volatility: Volatility;
  rtp: number;
  minStake: number;
  maxStake: number;
  /** Null only after a placeholder layout on a non-slot is cleared (LLM path, spec 01 §6.2). */
  reelLayout: string | null;
  maxWinMultiplier: number;
  jackpotNetwork: string | null;
  releaseYear: number;
  description: string;
}

// --- LLM generation (spec 01 §6.2) ---

export const GENERATE_PROMPT_VERSION = "generate-catalogue.v2";
export const GENERATION_TEMPERATURE = 0.7;
const BATCH_SIZE = 10;

export const loadGenerationPrompt = (): string => readFileSync(join(PROMPTS_DIR, `${GENERATE_PROMPT_VERSION}.md`), "utf8");

/** Our contract for a generated game. The provider's strict schema is not trusted on its own. */
const CreativeGameSchema = z.object({
  slot: z.number().int(),
  title: z.string().min(1),
  provider: z.enum(PROVIDERS),
  themes: z.array(z.enum(THEMES)),
  mechanics: z.array(z.enum(MECHANICS)),
  volatility: z.enum(VOLATILITIES),
  rtp: z.number(),
  minStake: z.number(),
  maxStake: z.number(),
  reelLayout: z.string(),
  maxWinMultiplier: z.number(),
  jackpotNetwork: z.enum(JACKPOT_NETWORKS).nullable(),
  releaseYear: z.number().int(),
  description: z.string(),
});
const BatchSchema = z.object({ games: z.array(CreativeGameSchema) });

/** The strict JSON schema sent to the provider: every field required, no extra keys, enums for closed lists. */
export const GENERATION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["games"],
  properties: {
    games: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["slot", "title", "provider", "themes", "mechanics", "volatility", "rtp", "minStake", "maxStake", "reelLayout", "maxWinMultiplier", "jackpotNetwork", "releaseYear", "description"],
        properties: {
          slot: { type: "integer" },
          title: { type: "string" },
          provider: { type: "string", enum: [...PROVIDERS] },
          themes: { type: "array", items: { type: "string", enum: [...THEMES] } },
          mechanics: { type: "array", items: { type: "string", enum: [...MECHANICS] } },
          volatility: { type: "string", enum: [...VOLATILITIES] },
          rtp: { type: "number" },
          minStake: { type: "number" },
          maxStake: { type: "number" },
          reelLayout: { type: "string" },
          maxWinMultiplier: { type: "number" },
          jackpotNetwork: { type: ["string", "null"], enum: [...JACKPOT_NETWORKS, null] },
          releaseYear: { type: "integer" },
          description: { type: "string" },
        },
      },
    },
  },
} as const;

/** One line per slate entry, in the format spec 01 §6.2 fixes. */
export function slateLine(s: SlateEntry): string {
  let line = `#${s.slot} type=${s.gameType}; primary theme=${s.primaryTheme}; series=${s.seriesName ?? "none"}`;
  if (s.misleadingTitle) line += "; misleading title";
  if (s.forced) {
    const extra = s.forced.extraThemes.length ? s.forced.extraThemes.join(",") : "none";
    line += `; MUST use mechanics=${s.forced.mechanics.join(",")}; volatility=${s.forced.volatility}; also themes=${extra}`;
  }
  return line;
}

export const batchUserMessage = (batch: readonly SlateEntry[]): string =>
  ["Create one game for each slate entry below, in the same order, echoing each slot number.", ...batch.map(slateLine)].join("\n");

export interface LlmGeneration {
  games: CreativeGame[];
  /** Everything changed after the model answered (spec 01 §6.2), recorded in the manifest. */
  repairs: GenerationRepair[];
}

export const MAX_REPAIR_ATTEMPTS = 3;

/** Parse a response for `entries`, matching games to slate entries by slot, and apply the per-entry clamps. */
function parseEntries(response: unknown, entries: readonly SlateEntry[]): CreativeGame[] {
  const parsed = BatchSchema.parse(response).games;
  const at = entries[0]?.slot;
  if (parsed.length !== entries.length) throw new Error(`batch at slot ${at}: expected ${entries.length} games, got ${parsed.length}`);
  return entries.map((s) => {
    const g = parsed.find((x) => x.slot === s.slot);
    if (!g) throw new Error(`batch at slot ${at}: no game for slot ${s.slot}`);
    return sanitiseCreative(g, s);
  });
}

/** The whole-catalogue repair steps, run after any entry changes. Both are idempotent. */
const alignAndEnforce = (games: CreativeGame[], slate: SlateEntry[]) => enforceSlate(alignSeries(games, slate), slate);

/**
 * Generate the creative fields for every slate entry, 10 per call. A batch that fails or returns the
 * wrong games is retried (3 attempts); if it still fails the whole run fails, so no entry is dropped.
 *
 * Then the repairs of spec 01 §6.2. Batches can't see each other, and the model doesn't always follow
 * the layout rules, so after series alignment and cluster enforcement (which settle each studio):
 *  1. each slot with a title collision, a repeated cluster title or a contradicting layout is
 *     regenerated alone (repairSlot), until none is left;
 *  2. live_dealer comes off non-live games, and placeholder layouts on non-slots become null.
 */
export async function generateWithLlm(slate: SlateEntry[], llm: JsonLlm, opts: { retry?: RetryOptions; system?: string } = {}): Promise<LlmGeneration> {
  const system = opts.system ?? loadGenerationPrompt();
  const call = (user: string) =>
    llm.completeJson({ system, user, schemaName: "catalogue_batch", schema: GENERATION_JSON_SCHEMA, temperature: GENERATION_TEMPERATURE });

  const out: CreativeGame[] = [];
  for (let start = 0; start < slate.length; start += BATCH_SIZE) {
    const batch = slate.slice(start, start + BATCH_SIZE);
    out.push(...(await withRetry(async () => parseEntries(await call(batchUserMessage(batch)), batch), opts.retry)));
  }

  let games = alignAndEnforce(out, slate);
  const repairs: GenerationRepair[] = [];
  // Each repair either leaves its slot problem-free (on both sides of any collision) or throws,
  // so the number of problems strictly decreases and the loop ends.
  for (let problem = findRegenerationProblems(games, slate)[0]; problem; problem = findRegenerationProblems(games, slate)[0]) {
    const { games: repaired, repair } = await repairSlot(games, slate, problem, call);
    games = repaired;
    repairs.push(repair);
  }
  const fixed = applyDeterministicFixes(games, slate);
  return { games: fixed.games, repairs: [...repairs, ...fixed.repairs] };
}

/**
 * The single-slot request: the slot's line, why the previous answer didn't fit (for a layout), and
 * every other slot's title, so a repair can't create a new collision. The versioned prompt file is
 * unchanged.
 */
export function repairUserMessage(entry: SlateEntry, otherTitles: readonly string[], instruction: string | null = null): string {
  const lines = [batchUserMessage([entry])];
  if (instruction !== null) lines.push(instruction);
  lines.push(`Titles already used (do not reuse): ${otherTitles.map((t) => JSON.stringify(t)).join(", ")}`);
  return lines.join("\n");
}

const REPAIR_KIND: Record<SlotProblem["kind"], RepairKind> = { title_studio: "title_studio", cluster_title: "cluster_title", real_name: "real_name", layout: "layout_regenerated" };

async function repairSlot(
  games: CreativeGame[],
  slate: SlateEntry[],
  problem: SlotProblem,
  call: (user: string) => Promise<unknown>,
): Promise<{ games: CreativeGame[]; repair: GenerationRepair }> {
  const entry = slate.find((s) => s.slot === problem.slot)!;
  const before = games.find((g) => g.slot === problem.slot)!;
  const otherTitles = games.filter((g) => g.slot !== entry.slot).map((g) => g.title);
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    try {
      const user = repairUserMessage(entry, otherTitles, problem.instruction);
      const [candidate] = parseEntries(await call(user), [entry]);
      const next = alignAndEnforce(games.map((g) => (g.slot === entry.slot ? candidate! : g)), slate);
      if (!involves(findRegenerationProblems(next, slate), entry.slot)) {
        const after = next.find((g) => g.slot === entry.slot)!;
        const repair: GenerationRepair =
          problem.kind === "layout"
            ? { kind: "layout_regenerated", slot: entry.slot, field: "reelLayout", before: before.reelLayout, after: after.reelLayout, attempts: attempt }
            : problem.kind === "real_name"
              ? { kind: "real_name", slot: entry.slot, field: "title", before: before.title, after: after.title, attempts: attempt, realNames: problem.realNames ?? [] }
              : { kind: REPAIR_KIND[problem.kind], slot: entry.slot, field: "title", before: before.title, after: after.title, attempts: attempt, collidedWithSlot: problem.otherSlot ?? undefined, provider: after.provider };
        return { games: next, repair };
      }
      lastError = undefined;
    } catch (err) {
      lastError = err;
    }
  }
  const detail = lastError ? `; last error: ${lastError instanceof Error ? lastError.message : String(lastError)}` : "";
  throw new Error(`${problem.message} (not repaired after ${MAX_REPAIR_ATTEMPTS} attempts${detail})`);
}

// --- Slate enforcement and creative clamps (appendix A4) ---

export function enforceSlate(games: CreativeGame[], slate: SlateEntry[]): CreativeGame[] {
  const clusterIndex = new Map<string, number>();
  return games.map((g) => {
    const s = slate.find((x) => x.slot === g.slot);
    if (!s?.forced) return g;
    const key = `${s.cluster}:${s.clusterRole}`; // members are numbered on their own, so all 5 get distinct studios
    const i = clusterIndex.get(key) ?? 0;
    clusterIndex.set(key, i + 1);
    const themes = Array.from(new Set([s.primaryTheme, ...s.forced.extraThemes])) as Theme[];
    return {
      ...g,
      themes,
      mechanics: [...s.forced.mechanics],
      volatility: s.forced.volatility,
      minStake: 0.2,
      maxStake: 50,
      jackpotNetwork: null,
      provider: PROVIDERS[i % PROVIDERS.length]!,
    };
  });
}

/** Clamp numbers and enforce the slate contract, whatever the model returned. */
function sanitiseCreative(g: CreativeGame, s: SlateEntry): CreativeGame {
  const themes = Array.from(new Set([s.primaryTheme, ...g.themes])).slice(0, 4) as Theme[];
  const mechanics = Array.from(new Set(g.mechanics)).slice(0, 5) as Mechanic[];
  return {
    ...g,
    slot: s.slot,
    themes,
    mechanics,
    reelLayout: String(g.reelLayout).slice(0, 40),
    maxWinMultiplier: Math.round(Math.min(50000, Math.max(50, g.maxWinMultiplier))),
    // A jackpot network only makes sense on a progressive game.
    jackpotNetwork: mechanics.includes("progressive_jackpot") && (JACKPOT_NETWORKS as readonly string[]).includes(String(g.jackpotNetwork)) ? g.jackpotNetwork : null,
    rtp: round(Math.min(97.5, Math.max(94, g.rtp)), 2),
    minStake: round(Math.min(1, Math.max(0.1, g.minStake)), 2),
    maxStake: round(Math.min(100, Math.max(2, g.maxStake)), 2),
    releaseYear: Math.min(2026, Math.max(2012, g.releaseYear)),
  };
}

/** Series members share a provider (the first member's) — a real catalogue invariant. */
function alignSeries(games: CreativeGame[], slate: SlateEntry[]): CreativeGame[] {
  const providerBySeries = new Map<string, string>();
  return games.map((g) => {
    const series = slate.find((s) => s.slot === g.slot)?.seriesName;
    if (!series) return g;
    if (!providerBySeries.has(series)) providerBySeries.set(series, g.provider);
    return { ...g, provider: providerBySeries.get(series)! };
  });
}

// --- Offline stand-in generator (appendix A5). Not sanitised: see spec 01 §6.4. ---

const TITLE_WORDS: Partial<Record<Theme, string[]>> = {
  egyptian: ["Pharaoh", "Scarab", "Sphinx", "Oasis"], mythology: ["Olympus", "Titan", "Oracle", "Medusa"],
  adventure: ["Lost Temple", "Expedition", "Explorer", "Hidden Map"], fruit: ["Cherry", "Melon", "Citrus", "Plum"],
  classic: ["Lucky Seven", "Bar Bell", "Retro Reel", "Golden Bell"], animals: ["Wolf", "Buffalo", "Panda", "Lion"],
  fantasy: ["Wizard", "Enchanted", "Dragon Keep", "Fairy"], horror: ["Haunted", "Crypt", "Midnight", "Vampire"],
  irish: ["Shamrock", "Leprechaun", "Rainbow", "Clover"], asian: ["Jade", "Lotus", "Koi", "Panda Palace"],
  sports: ["Penalty", "Goal", "Champion", "Stadium"], music: ["Rockstar", "Disco", "Encore", "Bassline"],
  space: ["Nebula", "Starship", "Galaxy", "Orbit"], pirates: ["Buccaneer", "Treasure Isle", "Kraken", "Jolly"],
  western: ["Outlaw", "Sheriff", "Gold Rush", "Saloon"], gems: ["Ruby", "Sapphire", "Diamond", "Emerald"],
  candy: ["Sugar", "Lollipop", "Gumdrop", "Toffee"], fishing: ["Big Catch", "Angler", "Tackle Box", "Lucky Lure"], underwater: ["Coral", "Pearl", "Mermaid", "Atlantis"],
  festive: ["Snowfall", "Jingle", "Holly", "Frost"], wealth: ["Gold Vault", "Fortune", "Mint", "Bullion"],
  nordic: ["Valhalla", "Rune", "Thunder", "Fjord"], aztec: ["Sun Temple", "Jaguar", "Quetzal", "Obsidian"],
  cards: ["Blackjack", "Baccarat", "Hold'em", "Pontoon"], roulette: ["Roulette", "Spin Royale", "Red & Black", "Wheel"],
  game_show: ["Prize Wheel", "Big Show", "Studio Spin", "Showtime"],
};
const SUFFIX = ["Riches", "Quest", "Spins", "Fortune", "Nights", "Rush", "Gold", "Legends"];

const MECH_BY_TYPE: Record<GameType, Mechanic[]> = {
  slot: ["megaways", "cluster_pays", "hold_and_win", "free_spins", "cascading_reels", "progressive_jackpot", "expanding_wilds", "multipliers", "pick_bonus", "sticky_wilds", "fixed_paylines"],
  table: ["side_bets", "multipliers"],
  live: ["live_dealer", "side_bets", "multipliers", "wheel_bonus"],
  instant_win: ["scratch_card", "multipliers", "pick_bonus"],
  bingo: ["progressive_jackpot", "pick_bonus", "multipliers"],
};

const RELATED: Partial<Record<Theme, Theme[]>> = {
  egyptian: ["adventure", "wealth"], nordic: ["mythology", "adventure"], irish: ["wealth", "classic"],
  underwater: ["adventure", "gems"], asian: ["wealth", "animals"], space: ["adventure", "gems"],
  fruit: ["classic"], western: ["adventure", "wealth"], pirates: ["adventure", "underwater"],
};

function generateOfflineRaw(slate: SlateEntry[], seed: number): CreativeGame[] {
  const rand = seededRandom(seed);
  const seriesMeta = new Map<string, { provider: string; mechanics: Mechanic[]; base: string; count: number }>();
  return slate.map((s) => {
    const words = TITLE_WORDS[s.primaryTheme] ?? ["Mystery"];
    let title: string, provider: string, mechanics: Mechanic[];
    if (s.forced) {
      const name = `${pick(rand, words)} ${s.gameType === "slot" ? pick(rand, SUFFIX) : s.gameType === "live" ? "Live" : s.gameType === "bingo" ? "Bingo" : "Scratch"}`;
      return offlineGame(rand, s, name, pick(rand, PROVIDERS), s.forced.mechanics);
    }
    if (s.misleadingTitle) {
      return offlineGame(rand, s, `${pick(rand, words)} Megaways`, pick(rand, PROVIDERS), ["scratch_card", "multipliers"]);
    }
    if (s.seriesName) {
      const meta = seriesMeta.get(s.seriesName) ?? { provider: pick(rand, PROVIDERS), mechanics: sampleN(rand, MECH_BY_TYPE.slot, 2), base: s.seriesName, count: 0 };
      seriesMeta.set(s.seriesName, meta);
      meta.count++;
      title = meta.count === 1 ? meta.base : `${meta.base} ${meta.count === 2 ? "Deluxe" : "Megaways"}`;
      provider = meta.provider;
      mechanics = Array.from(new Set([...meta.mechanics, ...(meta.count === 3 ? (["megaways"] as Mechanic[]) : [])]));
    } else {
      title = `${pick(rand, words)} ${s.gameType === "slot" ? pick(rand, SUFFIX) : s.gameType === "bingo" ? "Bingo" : s.gameType === "live" ? "Live" : s.gameType === "instant_win" ? "Scratch" : "Classic"}`;
      provider = pick(rand, PROVIDERS);
      mechanics = sampleN(rand, MECH_BY_TYPE[s.gameType], 1 + Math.floor(rand() * 3));
    }
    return offlineGame(rand, s, title, provider, mechanics);
  });
}

export function generateOffline(slate: SlateEntry[], seed = 7): CreativeGame[] {
  return enforceSlate(generateOfflineRaw(slate, seed), slate);
}

const LAYOUTS: Record<GameType, string[]> = {
  slot: ["5x3, 20 lines", "5x4, 40 lines", "6x4, 4,096 ways", "5x3, 10 lines"], table: ["single-zero wheel", "8-deck shoe"],
  live: ["single-zero wheel", "8-deck shoe", "money wheel"], instant_win: ["3x3 scratch grid"], bingo: ["90-ball", "75-ball"],
};

function offlineGame(rand: () => number, s: SlateEntry, title: string, provider: string, mechanics: Mechanic[]): CreativeGame {
  const words = TITLE_WORDS[s.primaryTheme] ?? ["Mystery"];
  const secondary = RELATED[s.primaryTheme] ?? [];
  const themes = Array.from(new Set([s.primaryTheme, ...sampleN(rand, secondary, Math.floor(rand() * 2))])) as Theme[];
  const volatility = s.forced?.volatility ?? pick(rand, ["low", "medium", "high"] as const);
  const mechText = mechanics.map((m) => m.replace(/_/g, " ")).join(", ");
  const typeText = s.gameType === "instant_win" ? "scratch card" : s.gameType.replace("_", " ");
  const sentences = [
    `${title} is a ${volatility}-volatility ${typeText} game with a ${themes.join(" and ")} theme.`,
    `Features include ${mechText}.`,
    `Set in a world of ${words.slice(0, 2).join(" and ").toLowerCase()}, every round brings new surprises.`,
    `Play from ${round(0.1 + rand() * 0.4, 2)} per round.`,
  ];
  const reelLayout = mechanics.includes("megaways") ? "6x7 Megaways, 117,649 ways" : mechanics.includes("cluster_pays") ? "7x7 cluster grid" : pick(rand, LAYOUTS[s.gameType]);
  const maxWin = { low: 500, medium: 2500, high: 10000, extreme: 50000 }[volatility] * (0.5 + rand());
  return {
    slot: s.slot,
    title,
    provider,
    themes,
    mechanics,
    volatility,
    rtp: round(94 + rand() * 3.5, 2),
    minStake: round(0.1 + rand() * 0.4, 2),
    maxStake: round(5 + rand() * 95, 0),
    reelLayout,
    maxWinMultiplier: Math.round(maxWin),
    jackpotNetwork: mechanics.includes("progressive_jackpot") ? pick(rand, JACKPOT_NETWORKS) : null,
    releaseYear: 2012 + Math.floor(rand() * 15),
    description: sentences.slice(0, 2 + Math.floor(rand() * 3)).join(" "),
  };
}
