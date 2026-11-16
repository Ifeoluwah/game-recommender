import type { ServiceConfig } from "../src/service/service-config.js";
import { recommend } from "../src/service/recommender.js";
import type { RecommendIndex } from "../src/service/recommender.js";

/**
 * Demo case 3, an NJ player on liberty (spec 05 §8). Prefers the first seed, in id order, that gets a
 * rail. Since `quality:no_shared_theme` no seed does on either committed build: about 22 live, eligible
 * games serve NJ across many themes, so none finds three theme-mates. Then the case shows the first
 * well-described NJ seed's decline, labelled as the expected outcome, instead of failing the demo.
 * Null only when no liberty/NJ seed exists at all.
 */
export interface NjCase {
  gameId: string;
  expect: string;
  note: string | null;
}

export const NJ_NO_RAILS_NOTE = "No liberty/NJ seed gets a rail in this build: too few eligible NJ games share a theme (README, \"Status\").";

export function pickNjCase(index: RecommendIndex, config: ServiceConfig, month: number): NjCase | null {
  const ids = Object.keys(index.games).sort();
  const ask = (gameId: string) => recommend(index, config, { gameId, brand: "liberty", market: "NJ", month });
  const ok = ids.find((id) => ask(id).status === "ok");
  if (ok) return { gameId: ok, expect: "200 ok", note: null };
  const declined = ids.find((id) => {
    const r = ask(id);
    return r.status === "declined" && r.reason === "NO_CONFIDENT_MATCHES";
  });
  if (declined) return { gameId: declined, expect: "200 declined NO_CONFIDENT_MATCHES", note: NJ_NO_RAILS_NOTE };
  return null;
}
