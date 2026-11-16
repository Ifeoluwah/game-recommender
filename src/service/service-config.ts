import { readFileSync } from "node:fs";
import { z } from "zod";
import { KNOWN_BRANDS, SERVICE_CONFIG_PATH } from "../config.js";
import { MARKETS, MECHANICS } from "../domain/vocabulary.js";

/**
 * config/service.json: brands, market restrictions, the recommendation policy and the rail settings.
 * Validated as a whole on load (spec 05 §6.3); a bad config must stop the service, not half-apply.
 */
export const ServiceConfigSchema = z
  .object({
    brands: z.record(z.object({ enabled: z.boolean(), markets: z.array(z.enum(MARKETS)).min(1) })),
    restrictedMechanicsByMarket: z.record(z.enum(MARKETS), z.array(z.enum(MECHANICS))),
    /** Product and safer-gambling choices owned with compliance, not a claim about any regulation. */
    policy: z.object({
      maxVolatilityStepUp: z.number().int().min(0),
      maxStakeMultiplier: z.number().positive(),
      maxMinStakeMultiplier: z.number().positive(),
    }),
    recommendation: z.object({
      defaultLimit: z.number().int().min(1),
      maxLimit: z.number().int().min(1),
      minResults: z.number().int().min(1),
      maxPerProvider: z.number().int().min(1),
      maxPerSeries: z.number().int().min(1),
      /** A threshold belongs to an embedding model; an index from an embedder without one is refused. */
      minScoreByEmbedder: z.record(z.number()),
    }),
    cacheMaxAgeSeconds: z.number().int().min(0),
  })
  .strict()
  .superRefine((c, ctx) => {
    for (const brand of Object.keys(c.brands)) {
      if (!(KNOWN_BRANDS as readonly string[]).includes(brand)) ctx.addIssue({ code: "custom", path: ["brands", brand], message: `unknown brand "${brand}"` });
    }
    if (c.recommendation.defaultLimit > c.recommendation.maxLimit) {
      ctx.addIssue({ code: "custom", path: ["recommendation", "defaultLimit"], message: "defaultLimit exceeds maxLimit" });
    }
  });

export type ServiceConfig = z.infer<typeof ServiceConfigSchema>;

export function loadServiceConfig(path: string = SERVICE_CONFIG_PATH): ServiceConfig {
  return ServiceConfigSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}
