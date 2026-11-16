import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { jsonFileText, mapLimit, retryDelayMs, sampleN, seededRandom, stableStringify, withRetry, writeFileAtomic } from "../src/util/misc.js";

describe("seeded sampling", () => {
  it("repeats for a seed and samples without replacement", () => {
    const a = sampleN(seededRandom(1), [1, 2, 3, 4, 5, 6], 4);
    expect(sampleN(seededRandom(1), [1, 2, 3, 4, 5, 6], 4)).toEqual(a);
    expect(new Set(a).size).toBe(4);
    expect(sampleN(seededRandom(1), [1, 2], 5)).toHaveLength(2);
  });

  it("stays in [0, 1)", () => {
    const rand = seededRandom(42);
    for (let i = 0; i < 1000; i++) {
      const x = rand();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("serialisation", () => {
  it("stableStringify ignores key order, keeps array order", () => {
    expect(stableStringify({ b: 1, a: { d: [2, 1], c: 0 } })).toBe(stableStringify({ a: { c: 0, d: [2, 1] }, b: 1 }));
    expect(stableStringify([2, 1])).not.toBe(stableStringify([1, 2]));
  });

  it("writes 2-space JSON with a trailing newline", () => {
    expect(jsonFileText({ a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}\n');
  });
});

describe("writeFileAtomic", () => {
  it("creates the folder, replaces the file and leaves no temp file", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "atomic-")), "nested");
    const path = join(dir, "out.json");
    writeFileAtomic(path, "first");
    writeFileAtomic(path, "second");
    expect(readFileSync(path, "utf8")).toBe("second");
    expect(readdirSync(dir)).toEqual(["out.json"]);
  });
});

describe("withRetry", () => {
  const noSleep = { sleep: async () => undefined };

  it("retries until success", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new Error("flaky");
      return "ok";
    }, noSleep);
    expect([result, calls]).toEqual(["ok", 3]);
  });

  it("throws the last error after 3 attempts", async () => {
    let calls = 0;
    await expect(withRetry(async () => { calls++; throw new Error(`fail ${calls}`); }, noSleep)).rejects.toThrow("fail 3");
    expect(calls).toBe(3);
  });

  it("waits base × 2^attempt × a jitter of 0.5–1.5", async () => {
    expect(retryDelayMs(0, 500, () => 0)).toBe(250);
    expect(retryDelayMs(1, 500, () => 0.5)).toBe(1000);
    expect(retryDelayMs(2, 500, () => 0.999)).toBeCloseTo(2000 * 1.499);
    const waits: number[] = [];
    await withRetry(async (attempt) => { if (attempt < 2) throw new Error("x"); }, { sleep: async (ms) => { waits.push(ms); }, random: () => 0.5 });
    expect(waits).toEqual([500, 1000]);
  });
});

describe("mapLimit", () => {
  it("keeps input order and never exceeds the limit", async () => {
    let inFlight = 0, peak = 0;
    const out = await mapLimit([5, 1, 4, 2, 3], 2, async (n, i) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, n));
      inFlight--;
      return `${i}:${n}`;
    });
    expect(out).toEqual(["0:5", "1:1", "2:4", "3:2", "4:3"]);
    expect(peak).toBe(2);
  });

  it("after a failure starts nothing new, lets in-flight work finish, then rejects with the first error", async () => {
    const started: number[] = [], finished: number[] = [];
    const run = mapLimit([0, 1, 2, 3, 4, 5], 2, async (n) => {
      started.push(n);
      if (n === 1) throw new Error("boom");
      await new Promise((r) => setTimeout(r, 10));
      finished.push(n);
      return n;
    });
    await expect(run).rejects.toThrow("boom");
    expect(started).toEqual([0, 1]); // item 2 onwards never started
    expect(finished).toEqual([0]); // item 0 was in flight and completed before the rejection
  });
});
