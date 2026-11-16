import { performance } from "node:perf_hooks";
import Fastify from "fastify";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { MARKETS } from "../domain/vocabulary.js";
import { round } from "../util/misc.js";
import type { LoadIndexResult } from "./index-store.js";
import { Metrics } from "./metrics.js";
import type { Outcome } from "./metrics.js";
import { currentUtcMonth, recommend } from "./recommender.js";
import type { ServiceConfig } from "./service-config.js";

/**
 * The HTTP API (spec 05 §6). Stateless and model-free: it serves a precomputed index and applies
 * the rules. No player identifier is received, and nothing about a player's restriction is logged.
 */

export interface ServerDeps {
  config: ServiceConfig;
  /** The result of loadIndex. A failed load serves not-ready rather than crashing. */
  index: LoadIndexResult;
  /** Injectable clock for seasonal rules; defaults to now. */
  now?: () => Date;
  /** Turn on request logging to stdout. Implied by `logStream`. */
  logger?: boolean;
  /** Capture the logs (tests). */
  logStream?: { write(line: string): void };
}

export const RelatedQuerySchema = z.object({
  brand: z.string().min(1),
  market: z.enum(MARKETS),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

/** One error shape for every 4xx (spec 05 §6.2). */
const errorBody = (error: string, details?: unknown) => ({ status: "error" as const, error, ...(details === undefined ? {} : { details }) });

export function buildServer(deps: ServerDeps): FastifyInstance {
  const { config } = deps;
  const index = deps.index.ok ? deps.index.index : null;
  const now = deps.now ?? (() => new Date());
  const metrics = new Metrics();
  metrics.setIndexVersion(index?.indexVersion ?? null);

  const logging = deps.logger || deps.logStream !== undefined;
  const app = Fastify({
    // Keep the caller's id so a request can be traced across services.
    requestIdHeader: "x-request-id",
    logger: logging
      ? {
          level: "info",
          ...(deps.logStream ? { stream: deps.logStream } : {}),
          // The default request serializer includes the client IP and port: player data.
          serializers: { req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }) },
        }
      : false,
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/ready", async (_req, reply) => {
    if (!deps.index.ok) return reply.code(503).send({ status: "not_ready", error: deps.index.error });
    const i = deps.index.index;
    return { status: "ready", indexVersion: i.indexVersion, embedding: i.embedding, enrichment: i.enrichment, games: Object.keys(i.games).length };
  });

  app.get("/metrics", async (_req, reply) => reply.type("text/plain; version=0.0.4; charset=utf-8").send(metrics.render()));

  app.get<{ Params: { gameId: string }; Querystring: Record<string, unknown> }>("/v1/games/:gameId/related", async (request, reply) => {
    const started = performance.now();
    const playerRestricted = String(request.headers["x-player-restricted"] ?? "").toLowerCase() === "true";
    const rawBrand = typeof request.query.brand === "string" ? request.query.brand : "";
    // A label value only from the config's brand list, so clients can't create unbounded series.
    const brandLabel = Object.hasOwn(config.brands, rawBrand) ? rawBrand : "invalid";
    const finish = (outcome: Outcome, reason: string) => {
      metrics.countRequest(outcome, reason, brandLabel);
      const ms = performance.now() - started;
      metrics.observeLatency(ms);
      return round(ms, 3);
    };
    const reject = (code: string, details?: unknown): FastifyReply => {
      finish("invalid", code);
      return reply.code(400).send(errorBody(code, details));
    };

    const parsed = RelatedQuerySchema.safeParse(request.query);
    if (!parsed.success) return reject("invalid_request", parsed.error.flatten().fieldErrors);
    const { brand, market, limit } = parsed.data;
    const brandConfig = Object.hasOwn(config.brands, brand) ? config.brands[brand] : undefined;
    if (!brandConfig) return reject("unknown_brand");
    if (!brandConfig.markets.includes(market)) return reject("brand_not_offered_in_market");
    if (!index) {
      finish("unavailable", "index_not_loaded");
      return reply.code(503).header("cache-control", "no-store").send({ status: "unavailable", items: [] });
    }

    const { gameId } = request.params;
    const result = recommend(index, config, { gameId, brand, market, limit, playerRestricted, month: currentUtcMonth(now()) });
    const latencyMs = finish(result.status, result.reason ?? "none");

    // A restriction next to a request id is player data: restricted requests are counted in the
    // metrics only (spec 07 §3.5).
    if (!playerRestricted) {
      request.log.info(
        { gameId, brand, market, outcome: result.status, reason: result.reason ?? null, items: result.items.length, filtered: result.diagnostics, latencyMs },
        "recommendation",
      );
    }

    return reply
      .code(result.reason === "UNKNOWN_GAME" ? 404 : 200)
      .header("x-index-version", index.indexVersion)
      .header("vary", "x-player-restricted")
      // Responses aren't personalised, so unrestricted ones can be cached at the CDN.
      .header("cache-control", playerRestricted ? "private, no-store" : `public, max-age=${config.cacheMaxAgeSeconds}`)
      .send({
        gameId,
        seedTitle: result.seed?.title ?? null,
        brand,
        market,
        indexVersion: index.indexVersion,
        status: result.status,
        ...(result.reason ? { reason: result.reason } : {}),
        items: result.items,
      });
  });

  return app;
}
