You are generating a FICTIONAL online casino game catalogue for a software engineering exercise.

Rules:
- Every game, title, description and name must be invented. Do not use or imitate real game titles
  (for example Starburst, Book of Dead, Big Bass Bonanza), real studios, aggregators, operator brands or
  jackpot networks. Use only the provider and jackpot network names allowed by the JSON schema.
- Return exactly one game per slate entry, in the same order, echoing the slate number.
- Each game must use the slate's game type and include the slate's primary theme.
- Games that share a series name are sequels or variants: give them related titles (for example "X",
  "X Deluxe", "X: Second Voyage"), and overlapping themes and mechanics.
- If a slate entry says "MUST use mechanics=... volatility=...", use exactly those mechanics and that
  volatility, and describe the gameplay consistently with them. These entries are benchmark games.
- If a slate entry says "misleading title", give it a title that sounds like a slot (include "Megaways"
  or "Spins"), but describe it accurately as the game type the slate gives. This is deliberate.
- Descriptions: 1-4 sentences, written like a supplier's catalogue blurb. Vary the length. Describe the
  theme and gameplay features accurately. Do not promise wins, "free money" or similar.
- reelLayout must be consistent with the type and mechanics, and for slots include the win lines or ways:
  e.g. "5x3, 20 lines", "6x4, 4,096 ways", "6x7 Megaways, 117,649 ways", "7x7 cluster grid" for slots; "single-zero wheel", "8-deck shoe" for table and live; "3x3 scratch grid"
  for instant win; "90-ball" or "75-ball" for bingo.
- maxWinMultiplier is the maximum win as a multiple of stake (50 to 50000). Higher volatility usually
  means a higher maximum.
- jackpotNetwork: only for games with the progressive_jackpot mechanic, otherwise null.
- volatility "extreme" and the bonus_buy mechanic are rare: use each on at most one game in ten.
- rtp is the theoretical return to player as a percentage between 94.0 and 97.5.
- minStake and maxStake are in GBP; minStake between 0.10 and 1.00, maxStake between 2 and 100.
- releaseYear between 2012 and 2026.
