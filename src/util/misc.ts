import { createHash } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// --- PRNG and sampling (appendix A1). Every seeded draw in the dataset goes through these. ---

export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(rand: () => number, items: readonly T[]): T => {
  if (items.length === 0) throw new Error("pick from empty list");
  return items[Math.floor(rand() * items.length)] as T;
};

export function sampleN<T>(rand: () => number, items: readonly T[], n: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

/** Appendix A15. */
export const round = (n: number, dp = 3): number => Math.round(n * 10 ** dp) / 10 ** dp;

// --- Hashing and serialisation (spec 01 §10) ---

export const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, sortKeys(obj[k])]));
  }
  return v;
}

/** JSON with object keys sorted recursively and array order kept, so equal content hashes equally. */
export const stableStringify = (v: unknown): string => JSON.stringify(sortKeys(v));

/** The on-disk format of every data and artefact file. The raw feed's bytes are hashed, so this is fixed. */
export const jsonFileText = (v: unknown): string => `${JSON.stringify(v, null, 2)}\n`;

// --- Files ---

/**
 * Write through a temp file and a rename, so a killed process never leaves a half-written file for
 * the service or the next build to load (spec 07 §3.2).
 */
export function writeFileAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, text, "utf8");
    renameSync(tmp, path);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

/** Load `.env` if it exists. A missing file is normal (CI, offline runs); anything else is an error. */
export function loadEnvIfPresent(path: string): boolean {
  try {
    process.loadEnvFile(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw err;
  }
}

// --- Concurrency and retries ---

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface RetryOptions {
  attempts?: number;
  baseMs?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Injectable for tests; jitter affects timing only, never data, so Math.random is fine. */
  random?: () => number;
}

/** Delay before retry n (0-based): base × 2^n × a random 0.5–1.5, so parallel workers don't retry in lockstep. */
export const retryDelayMs = (attempt: number, baseMs: number, random: () => number = Math.random): number =>
  baseMs * 2 ** attempt * (0.5 + random());

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseMs = opts.baseMs ?? 500;
  const wait = opts.sleep ?? sleep;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (attempt < attempts - 1) await wait(retryDelayMs(attempt, baseMs, opts.random));
    }
  }
  throw lastError;
}

/** Map with at most `limit` calls in flight, keeping input order in the result. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

export const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));
