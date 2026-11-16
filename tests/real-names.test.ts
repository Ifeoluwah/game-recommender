import { describe, expect, it } from "vitest";
import { REAL_WORLD_NAMES, findRealNames, nameTokens } from "../src/catalogue/real-names.js";
import { generateOffline } from "../src/catalogue/creative.js";
import { buildSlate } from "../src/catalogue/slate.js";

describe("findRealNames (spec 01 §6.2)", () => {
  it.each<[string, string[]]>([
    // The first rebuild's real-name titles
    ["Wheel of Fortune Live", ["wheel of fortune"]],
    ["Casino Royale Live", ["casino royale"]],
    ["Candyland Delight", ["candyland"]],
    // Case and punctuation don't matter
    ["CASINO-ROYALE!", ["casino royale"]],
    ["Gonzo's Quest Megaways", ["gonzos quest"]],
    ["Guns N' Roses Reels", ["guns n roses"]],
    ["Light & Wonder Spins", ["light and wonder"]],
    ["Candy Land Express", ["candy land"]],
    ["The Monopoly Heist", ["monopoly"]],
  ])("catches %j", (title, expected) => {
    expect(findRealNames(title)).toEqual(expected);
  });

  it.each([
    // Whole tokens only: a real name inside a longer word, or split by another word, doesn't count
    ["Monopolyx Riches"],
    ["Wheel of Great Fortune"],
    ["Starbursting Gems"],
    // Ordinary words that real titles happen to use are deliberately not listed
    ["Fortune Wheel Live"],
    ["Roulette Royale"],
    ["Thrill of the Chase"],
    ["Curse of the Mummy"],
    ["Gladiator Arena"],
    ["Caesar's Empire"],
    ["Red Tiger Riches"],
    ["Gold Rush Spins"],
    ["Spin the Fortune Wheel"],
  ])("lets %j through", (title) => {
    expect(findRealNames(title)).toEqual([]);
  });

  it("normalises entries the way it normalises titles, so every entry can match", () => {
    for (const name of REAL_WORLD_NAMES) expect(findRealNames(name)).toContain(name);
    expect(nameTokens("Gonzo’s Quest")).toEqual(["gonzos", "quest"]);
  });

  it("finds nothing in the offline stand-in's titles", () => {
    // The check runs on the LLM path only, but the offline generator's word lists shouldn't collide with it either.
    const titles = generateOffline(buildSlate()).map((g) => g.title);
    expect(titles.flatMap((t) => findRealNames(t))).toEqual([]);
  });
});
