import type { EnrichedGame, EnrichmentMethod, EnrichmentProposal, NormalisedGame, Provenance } from "../domain/types.js";
import { isGameType, isMechanic, isTheme, isVolatility } from "../domain/vocabulary.js";
import type { Mechanic, Theme } from "../domain/vocabulary.js";

/**
 * The guard between every enricher (LLM, rules, fallback, skipped) and the rest of the pipeline
 * (spec 04 §6). It holds whatever the model returns: the prompt is a request, this is the contract.
 */

/**
 * A summary matching any of these is discarded, not repaired: a repaired summary is still the model's
 * text, with the evidence of the problem removed. The last two catch regulated figures (RTP-like
 * percentages, money amounts), which may only come from source fields.
 */
export const BANNED_SUMMARY_PATTERNS: readonly RegExp[] = [
  /guarantee/i,
  /free money/i,
  /risk[- ]free/i,
  /sure win/i,
  /can'?t lose/i,
  /\bwin big\b/i,
  /jackpot awaits/i,
  /play now/i,
  /sign up/i,
  /bonus offer/i,
  /ignore (all )?previous/i,
  /instruction/i,
  /recommend(ed)? (it )?to every/i,
  /\d+(\.\d+)?\s?%/i,
  /[£$€]\s?\d/i,
];

/** The prompt asks for at most 200; 240 is deliberate slack, so a slightly long valid sentence isn't cut. */
export const SUMMARY_MAX_CHARS = 240;

export function lintSummary(text: string): { summary: string; flags: string[] } {
  const collapsed = text.replace(/\s+/g, " ").trim();
  const banned = BANNED_SUMMARY_PATTERNS.filter((re) => re.test(collapsed));
  if (banned.length) return { summary: "", flags: banned.map((re) => `summary_banned:${re.source}`) };
  if (collapsed.length > SUMMARY_MAX_CHARS) return { summary: `${collapsed.slice(0, SUMMARY_MAX_CHARS - 1)}…`, flags: ["summary_truncated"] };
  return { summary: collapsed, flags: [] };
}

export interface GuardMeta {
  method: EnrichmentMethod;
  model: string | null;
  promptVersion: string;
  error?: string | null;
  cached?: boolean;
  proposedAt?: string | null;
}

export const MAX_THEMES = 4;
export const MAX_MECHANICS = 5;
/** Descriptions shorter than this carry no real copy (spec 04 §4, §6.5). */
export const MIN_COPY_CHARS = 25;

/** Keep every source tag; add valid proposed ones up to the cap; collect the off-vocabulary ones. */
function mergeTags<T extends string>(source: readonly T[], proposed: readonly string[], isValid: (v: unknown) => v is T, cap: number, rejected: string[]): T[] {
  const out = [...source];
  for (const tag of proposed) {
    if (!isValid(tag)) rejected.push(tag);
    else if (!out.includes(tag) && out.length < cap) out.push(tag);
  }
  return out;
}

export function applyGuard(base: NormalisedGame, proposal: EnrichmentProposal, meta: GuardMeta): EnrichedGame {
  const rejected: string[] = [];
  const guardFlags: string[] = [];

  // Vocabulary: anything outside it is dropped and counted.
  if (proposal.gameType !== null && !isGameType(proposal.gameType)) rejected.push(`gameType:${proposal.gameType}`);
  if (proposal.volatility !== null && !isVolatility(proposal.volatility)) rejected.push(`volatility:${proposal.volatility}`);
  const proposedType = isGameType(proposal.gameType) ? proposal.gameType : null;
  const proposedVolatility = isVolatility(proposal.volatility) ? proposal.volatility : null;

  // Source wins: an enricher only fills gaps, and never removes a source tag.
  const gameType = base.gameType ?? proposedType;
  const volatility = base.volatility ?? proposedVolatility;
  const themes = mergeTags<Theme>(base.themes, proposal.themes, isTheme, MAX_THEMES, rejected);
  const mechanics = mergeTags<Mechanic>(base.mechanics, proposal.mechanics, isMechanic, MAX_MECHANICS, rejected);

  const lint = lintSummary(proposal.matchingSummary);
  guardFlags.push(...lint.flags);

  // Insufficient (layers 1 and 4): a record the source can't describe is never recommended,
  // however confident the enricher is. A cold-start release with supplier tags stays matchable.
  const shortCopy = base.description.length < MIN_COPY_CHARS;
  const thinSource = shortCopy && base.themes.length === 0 && base.mechanics.length === 0;
  const sourceStructured = base.gameType !== null && base.themes.length >= 1;
  const insufficient = thinSource || (!sourceStructured && (proposal.insufficientInformation || (proposal.confidence === "low" && shortCopy)));
  if (thinSource && !proposal.insufficientInformation) guardFlags.push("insufficient_forced_by_guard");

  // Provenance per field: source if the source had it, else the enricher that filled it, else missing.
  const filledBy: Provenance = meta.method === "llm" ? "llm" : "rules";
  const provenance = (fromSource: boolean, filled: boolean): Provenance => (fromSource ? "source" : filled ? filledBy : "missing");

  return {
    // Everything authoritative (title, provider, RTP, stakes, max win, layout, jackpot network, status,
    // test flag, season, brands, markets) is the normalised record's, and nothing else's.
    ...base,
    gameType,
    themes,
    mechanics,
    volatility,
    matchingSummary: lint.summary,
    provenance: {
      gameType: provenance(base.gameType !== null, gameType !== null),
      themes: provenance(base.themes.length > 0, themes.length > 0),
      mechanics: provenance(base.mechanics.length > 0, mechanics.length > 0),
      volatility: provenance(base.volatility !== null, volatility !== null),
    },
    enrichment: {
      method: meta.method,
      model: meta.model,
      promptVersion: meta.promptVersion,
      confidence: proposal.confidence,
      insufficient,
      rejectedTags: rejected,
      guardFlags,
      error: meta.error ?? null,
      cached: meta.cached ?? false,
      proposedAt: meta.proposedAt ?? null,
    },
  };
}
