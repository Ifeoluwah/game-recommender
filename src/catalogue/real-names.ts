/**
 * Real-world names a generated title must not use (spec 01 §4 hard rule; checked in the §6.2 repair
 * loop). The prompt already forbids real names; this is the code backstop for when a model ignores it.
 *
 * NOT EXHAUSTIVE. This lists well-known real brands, operators, studios, game franchises, casino
 * games, game shows, films, TV shows and board games that a casino-themed model is likely to reach
 * for. A real name missing from it gets through, so reviewing a build's titles is still part of
 * inspecting it. Add a name here when an inspection finds one.
 *
 * Entries are phrases, matched on whole tokens after normalising case and punctuation, so specific
 * phrases are preferred over single generic words ("gold rush", "fortune" and "royale" are ordinary
 * words, not listed). Where a name is commonly written either way, both spellings are listed.
 */
export const REAL_WORLD_NAMES: readonly string[] = [
  // Game shows and TV
  "wheel of fortune", "deal or no deal", "the price is right", "family feud", "jeopardy", "who wants to be a millionaire",
  "big brother", "x factor", "britains got talent", "game of thrones", "the walking dead", "breaking bad",
  "squid game", "stranger things", "the simpsons", "top gear", "love island",
  // Films and film franchises (ordinary words like "gladiator", "titanic" or "the mummy" are left out)
  "casino royale", "james bond", "007", "goldfinger", "the godfather", "jurassic park", "star wars", "harry potter",
  "indiana jones", "top gun", "the hangover", "ghostbusters", "terminator",
  "pirates of the caribbean", "oceans eleven", "the wizard of oz", "lord of the rings", "the hobbit", "batman",
  "superman", "spider man", "spiderman", "marvel comics", "rocky balboa", "the matrix",
  "kill bill", "the great gatsby", "scarface",
  // Board games, toys and characters
  "monopoly", "candy land", "candyland", "cluedo", "scrabble", "battleship", "yahtzee", "barbie", "lego",
  "hello kitty", "rubiks cube",
  // Video games
  "super mario", "pac man", "pacman", "tetris", "street fighter", "sonic the hedgehog", "space invaders", "angry birds",
  "fortnite", "minecraft", "pokemon",
  // Real slot and casino game titles
  "starburst", "book of dead", "book of ra", "big bass bonanza", "gonzos quest", "mega moolah", "gates of olympus",
  "sweet bonanza", "dead or alive", "rainbow riches", "da vinci diamonds", "immortal romance", "thunderstruck",
  "reactoonz", "jammin jars", "wolf gold", "fire joker", "legacy of dead", "reel king", "fishin frenzy",
  "eye of horus", "cleopatra", "buffalo blitz", "bonanza megaways", "extra chilli", "money train", "san quentin",
  "wanted dead or a wild", "the dog house", "fruit party", "aztec gems", "great rhino", "wild west gold",
  "lightning roulette", "crazy time", "dream catcher", "monopoly live", "mega ball", "funky time", "lightning dice",
  "football studio", "cash or crash", "jackpot king", "wowpot",
  // Operators, studios and casino brands
  "bet365", "william hill", "paddy power", "betfair", "ladbrokes", "pokerstars", "draftkings", "fanduel", "betmgm",
  "caesars palace", "bellagio", "netent", "microgaming", "play n go", "pragmatic play", "evolution gaming", "playtech",
  "igt", "novomatic", "aristocrat leisure", "big time gaming", "nolimit city", "red tiger gaming", "yggdrasil", "relax gaming",
  "push gaming", "blueprint gaming", "light and wonder", "scientific games", "games global",
  // Musicians and celebrities used as slot licences
  "elvis", "michael jackson", "guns n roses", "motorhead", "jimi hendrix", "playboy",
];

/** Lowercase; drop apostrophes ("gonzo's" → "gonzos"); "&" → "and"; everything else non-alphanumeric splits tokens. */
export const nameTokens = (s: string): string[] =>
  s.toLowerCase().replace(/['’`]/g, "").replace(/&/g, " and ").split(/[^a-z0-9]+/).filter(Boolean);

const ENTRY_TOKENS = REAL_WORLD_NAMES.map((name) => ({ name, tokens: nameTokens(name) }));

/** The deny-list entries a title contains as a contiguous run of whole tokens. */
export function findRealNames(title: string): string[] {
  const t = nameTokens(title);
  return ENTRY_TOKENS.filter(({ tokens }) => {
    for (let i = 0; i + tokens.length <= t.length; i++) {
      if (tokens.every((tok, k) => t[i + k] === tok)) return true;
    }
    return false;
  }).map(({ name }) => name);
}
