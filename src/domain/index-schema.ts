import { z } from "zod";
import { GAME_TYPES, MARKETS, MECHANICS, THEMES, VOLATILITIES } from "./vocabulary.js";

/**
 * The service artefact (spec 05 §4.3). Kept free of AI imports so the service can validate an index
 * without loading a model SDK (AGENTS.md rule 1).
 */

/** What the service knows about a game: source facts plus the guarded matching fields it filters on. */
export const ServiceGameSchema = z.object({
  id: z.string(),
  title: z.string(),
  provider: z.string().nullable(),
  gameType: z.enum(GAME_TYPES).nullable(),
  seriesId: z.string().nullable(),
  dedupeKey: z.string(),
  brands: z.array(z.string()),
  markets: z.array(z.enum(MARKETS)),
  /** Already collapsed by normalise.ts: anything not explicitly live is "withdrawn". */
  status: z.enum(["active", "withdrawn"]),
  isTestGame: z.boolean(),
  seasonMonths: z.array(z.number().int().min(1).max(12)).nullable(),
  insufficient: z.boolean(),
  volatility: z.enum(VOLATILITIES).nullable(),
  maxStake: z.number().nullable(),
  minStake: z.number().nullable(),
  mechanics: z.array(z.enum(MECHANICS)),
  /** Guarded enriched themes. Read only by the quality rule `no_shared_theme` (spec 02 §6.2). */
  themes: z.array(z.enum(THEMES)),
});
export type ServiceGame = z.infer<typeof ServiceGameSchema>;

/** 3 added `themes`. A schema 2 index lacks them and is refused on load. */
export const INDEX_SCHEMA_VERSION = 3;

export const IndexSchema = z
  .object({
    schemaVersion: z.literal(INDEX_SCHEMA_VERSION),
    indexVersion: z.string().regex(/^[0-9a-f]{12}$/),
    builtAt: z.string().datetime(),
    catalogueHash: z.string().regex(/^[0-9a-f]{16}$/),
    enrichment: z.object({ method: z.string(), model: z.string().nullable(), promptVersion: z.string() }),
    embedding: z.object({ id: z.string().min(1), dim: z.number().int().positive() }),
    games: z.record(ServiceGameSchema),
    neighbours: z.record(z.array(z.tuple([z.string(), z.number()]))),
  })
  .superRefine((index, ctx) => {
    // Referential integrity, so the service never meets an id it can't resolve.
    for (const [key, g] of Object.entries(index.games)) {
      if (g.id !== key) ctx.addIssue({ code: "custom", path: ["games", key], message: `game keyed "${key}" has id "${g.id}"` });
    }
    for (const [key, list] of Object.entries(index.neighbours)) {
      if (!index.games[key]) ctx.addIssue({ code: "custom", path: ["neighbours", key], message: `neighbours for unknown game "${key}"` });
      for (const [id] of list) {
        if (!index.games[id]) ctx.addIssue({ code: "custom", path: ["neighbours", key], message: `unknown neighbour "${id}"` });
        if (id === key) ctx.addIssue({ code: "custom", path: ["neighbours", key], message: "a game is its own neighbour" });
      }
    }
  });
export type RecommendationIndex = z.infer<typeof IndexSchema>;
