# Brand Voice Tweets

Generates 10 on-brand tweets for any brand, with a transparent Voice Card showing where each trait came from.

## Pipeline

1. **Research (optional):** if a brand name is given, an LLM with web search looks for the brand's *own* posts and campaigns. Observations are kept separate from third-party commentary. If research fails or no name is given, the run continues on user inputs.
2. **Voice Card:** form inputs, pasted posts and research notes become a structured card. Every trait carries an evidence label (`user-defined`, `supported-by-examples`, `web-supported`, `inferred`). Explicit user instructions win any conflict, and conflicts are listed for review.
3. **Mix plan (code):** the campaign objective sets the 10-tweet split across engaging, promotional, witty and informative, interleaved.
4. **Generation:** one tweet per slot, following the card's style rules.
5. **Checks (code):** length (X weighting), emoji and hashtag limits from the card, avoided words, generic AI phrasing, placeholders, near-duplicates, repeated openings, style mix.
6. **Critic (model):** one editing pass revises weak tweets. A revision is accepted only if it adds no code-check failures across the set.

## Web app

```bash
npm install
cp .env.example .env        # add your OPENAI_API_KEY
npm run dev                 # http://localhost:3000
```

Three steps on one page: brand details, an editable Voice Card (every trait carries an evidence chip), then 10 tweets styled like X posts with Copy, Copy all and per-tweet Regenerate. The sample picker (Zomato with real posts, CRED, a no-name millet brand) loads a saved result with no API call. The API key stays on the server; per-visitor rate limits and a 24-hour research cache are in `server/limits.js`.

## Run the pipeline from the command line

Requires Node 20.6+.

```bash
npm install
cp .env.example .env        # add your OPENAI_API_KEY
npm run check-access        # which models work, and whether web search works
npm run test:pipeline -- zomato
npm run test:pipeline -- millet --no-search
```

Test brands: `zomato`, `cred`, `millet` (no brand name), `zomato-rebrand` (user instructions conflict with known voice). Raw results are saved to `outputs/`.
