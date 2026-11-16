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
export const slotsInRequest = (user: string): Array<{ slot: number; primaryTheme: string }> =>
  [...user.matchAll(/^#(\d+) type=\w+; primary theme=(\w+);/gm)].map((m) => ({ slot: Number(m[1]), primaryTheme: m[2]! }));

export const noSleep = { sleep: async () => undefined } as const;
