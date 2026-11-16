import type { JsonLlm } from "../../src/ai/providers.js";

export type CompleteArgs = Parameters<JsonLlm["completeJson"]>[0];

/** A scripted JsonLlm: no network, records every call. */
export class FakeJsonLlm implements JsonLlm {
  readonly id: string;
  readonly calls: CompleteArgs[] = [];
  constructor(private readonly respond: (args: CompleteArgs, callIndex: number) => unknown | Promise<unknown>, id = "fake:test-model") {
    this.id = id;
  }
  async completeJson(args: CompleteArgs): Promise<unknown> {
    this.calls.push(args);
    return this.respond(args, this.calls.length - 1);
  }
}

/** Slate lines in a generation request: "#12 type=slot; primary theme=egyptian; series=none…". */
export const slotsInRequest = (user: string): Array<{ slot: number; gameType: string; primaryTheme: string }> =>
  [...user.matchAll(/^#(\d+) type=(\w+); primary theme=(\w+);/gm)].map((m) => ({ slot: Number(m[1]), gameType: m[2]!, primaryTheme: m[3]! }));

/** A layout that fits each game type (spec 01 §6.2), so a fake model doesn't trigger layout repairs by accident. */
export const layoutFor = (gameType: string): string =>
  ({ slot: "5x3, 20 lines", table: "single-zero wheel", live: "money wheel", instant_win: "3x3 scratch grid", bingo: "90-ball" })[gameType] ?? "5x3, 20 lines";

export const noSleep = { sleep: async () => undefined } as const;
