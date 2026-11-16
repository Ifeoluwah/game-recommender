import { generateDataset } from "../../src/catalogue/dataset.js";
import type { Dataset } from "../../src/catalogue/dataset.js";

/**
 * The full offline dataset, built in memory. Tests never read the files under data/: they build
 * their own, so they pass on a fresh clone with no build outputs (spec 05 §9).
 */
let cached: Promise<Dataset> | undefined;
export const offlineDataset = (): Promise<Dataset> => (cached ??= generateDataset({ now: () => new Date("2026-01-01T00:00:00Z") }));
