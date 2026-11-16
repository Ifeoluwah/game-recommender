import { describe, expect, it } from "vitest";
import { resolveProviderMode } from "../src/ai/providers.js";

describe("resolveProviderMode", () => {
  it("honours the flag, key or not", () => {
    expect(resolveProviderMode(["--provider=offline"], { OPENAI_API_KEY: "sk-test" }).mode).toBe("offline");
    expect(resolveProviderMode(["--provider=openai"], {}).mode).toBe("openai");
  });

  it("without the flag, picks openai only when a key is set, and says why", () => {
    expect(resolveProviderMode([], { OPENAI_API_KEY: "sk-test" })).toEqual({ mode: "openai", reason: expect.stringMatching(/OPENAI_API_KEY is set/) });
    expect(resolveProviderMode([], {})).toEqual({ mode: "offline", reason: expect.stringMatching(/no OPENAI_API_KEY/) });
  });

  it("rejects unknown values", () => {
    expect(() => resolveProviderMode(["--provider=bedrock"], {})).toThrow(/unknown --provider value/);
  });
});
