# Project context for Claude Code

## What this is
Round 1 assignment for the AI Product Engineer (Fresher) role at Walnut Folks / Confluencr (influencer marketing agency).
Brief: build a tool where a user enters brand details and gets (a) a 3-4 bullet brand voice summary and (b) 10 on-brand tweets with a mix of engaging, promotional, witty/meme and informative styles.
Deliverables: live link to test, example outputs for 2+ brands, short approach doc, repo. All compiled in one Google Doc.
**Deadline: Sunday 25 October 2026, end of day IST.** Target submission ~4 PM Sunday.

Graded on: understanding of brand voice, tweet quality, creativity/variation, clarity of approach, prompt design/logic, simplicity and usability.

## Architecture (already built in lib/, tested offline)
1. `researchBrand` - optional. OpenAI Responses API + `web_search` tool. Looks for the brand's OWN posts; separates OBSERVED from REPORTED (third-party commentary). Never fatal: on failure or no brand name, the run continues on user inputs.
2. `analyzeBrand` - builds a Voice Card (strict JSON schema in lib/schemas.js).
3. `planMix` (lib/plan.js) - campaign objective decides the 10-tweet style split, in code, interleaved. Each slot also gets an ANGLE (rotates per style) and a THEME from card.content_themes (rotates across slots), so ideas are spread by design, not by a fuzzy check.
4. `generateTweets` - one tweet per slot.
5. `checkSet` (lib/checks.js) - deterministic checks: X-weighted length, emoji/hashtag limits from the card, avoid_words, generic AI phrasing, placeholders, instruction leaks, Instagram-only phrasing (platform_mismatch), clichés, invented numbers (anything not in the BRIEF; witty slots may exaggerate with counts and durations, but money and percentages are flagged everywhere), brand name in more than 4 tweets, near-duplicates, repeated openings, repeated 4-word phrases, style mix.
6. Critic pass - one model call revises weak tweets. A revision is accepted only if it introduces no issue CODE its original tweet did not already have, and no new kind of failure on any other tweet (codes, not counts). Rejected revisions are recorded (original, rejected text, failed checks), never dropped silently. If the critic call itself fails, the checked drafts are returned with a warning instead of failing the run.

## Web app (Next.js App Router, JavaScript, Tailwind; built 24 Oct 2026, not deployed yet)
- Routes: `POST /api/analyze` (research then Voice Card, streamed NDJSON progress), `POST /api/generate` (tweets, streamed), `POST /api/regenerate` (one slot, plain JSON via `regenerateTweet` in lib/pipeline.js). Routes only call lib/; no pipeline logic is forked. The OpenAI key is read server-side only; no database, no auth.
- Anything the browser sends back (edited card, current tweets) is re-validated by lib/card.js (schema-based: unknown fields dropped, enums enforced, sizes capped).
- UI: app/page.jsx (3 steps on one page: Details / Voice / Tweets), app/components/*. After the 24 Oct UI review: the tweets page shows the voice summary and Copy all copies summary + tweets as plain text; the Voice page keeps summary, legend, tone and hooks visible and collapses the rest (themes and real lines open) with a sticky Generate bar; conflicts are a one-line notice; all textareas autosize (`AutoTextarea`); cards read "<Brand> · draft preview" with no handle or action icons. Footer links (GitHub, approach doc) come from `app/site.js`; `REPO_URL` and `APPROACH_DOC_URL` are both set. Edited tone traits are marked `user-defined`. `scripts/test-brands.json` is the single source for the two example buttons. Samples are static files in `public/samples/` (made with `scripts/make-sample.mjs`); loading one costs nothing.
- `maxDuration`: analyze 300s, generate 300s, regenerate 120s. Per Vercel docs (checked 24 Oct 2026) the limit with Fluid Compute (default) is 300s on Hobby and 800s on Pro. The OpenAI client has a 90s timeout and 1 retry (lib/openai.js), so a stuck web search cannot use up the function; research failure is non-fatal.
- Protection: per-IP in-memory limits (analyze 5/h, generate 10/h, regenerate 30/h) and a 24h research cache keyed by lowercase brand name + industry + website (only successful research is cached), both in `server/limits.js`. Input caps come from `INPUT_LIMITS` (lib/config.js) and are enforced in the form (live counters) and on the server. Raw API errors are logged server-side and never shown to visitors. Each request logs `[usage]` (estimated cost) to the server log.
- Streaming responses use `Cache-Control: no-cache, no-transform`, not `no-store`: with `no-store` Chrome's DevTools reports every fully-read stream as `ERR_ABORTED / canceled` (data and UI were fine; the client never cancels its reader). Found and verified locally with `scripts/fake-openai.mjs`.
- Samples: `public/samples/{zomato,cred,millet}.json` are the three free samples (zomato = the `zomato-posts` run, cred = name only, millet = no brand name), with a picker on the form. Regenerate them from a newer run with `scripts/make-sample.mjs`.
- Review fixes (24 Oct 2026, after an independent review):
  - Stale state: `lib/view-state.js` (tested offline). Each Voice Card remembers the brief it was built from and each tweet set remembers the brief and card it was written from. Any brief change (objective included, since it decides the mix) marks the card and tweets "Outdated: your brief changed" and requires a rebuild; any card edit (summary bullets included) marks the tweets "Outdated: Voice Card changed. Regenerate to apply." Names, summary and regenerate all use the snapshot, never the live form.
  - Voice summary bullets are editable. The conflict banner is worded from the recorded resolutions (neutral fallback "N conflicting signals reviewed. Details below.").
  - UI wording no longer makes absolute claims ("Grounded in your brief, with checks for unsupported details. Review facts before posting.").
  - Research switch: `inputs.research` (default true); off skips research. The research cache key is brand name + industry.
  - `humour_allowed` on the Voice Card (schema, analysis prompt, one writer rule). When false, `planMix` replaces witty slots with engaging/informative ones (`plan.wittyReplaced`) and the tweets page says so. Cards without the field (older samples) count as true. This is the one prompt change allowed under the lock, requested explicitly.
- Second review round (24 Oct 2026):
  - Footer: `APPROACH_DOC_URL` is set in `app/site.js`.
  - "Based on:" line under the voice summary (Voice and Tweets pages), built in code by `evidenceBasis` (lib/view-state.js) from the pasted posts, the research result and the card's assumptions. It adds the qualification when the assumptions say no X posts were found or the voice was adapted from a website, campaign pages or LinkedIn. It reads assumptions by keyword, so unusual wording can be missed.
  - New optional fields. Website: goes into the research input and the research cache key (normalised: no protocol, `www.` or trailing slash), not into the brief, so tweets still cannot link to it. Target audience: goes into the brief; if typed, code forces `target_audience.evidence` to `user-defined`. Max tweet length (60-280, default 280, `normalizeMaxLength`): the writer and editor prompts say "At most N characters" (default 280 keeps the 260 target), `too_long` uses N, and the counter shows x/N. These two prompt edits plus two one-line prompt additions (audience, brief line) are the only prompt changes.
  - Refresh recovery: `app/lib/session.js` keeps the brief, card and tweet set in sessionStorage (all calls in try/catch) and Start over clears it.
  - "Tone changed. Check the summary still matches." appears next to the summary once a tone trait differs from the card as built.
  - Samples without the new fields use the defaults.
- `AGENTS.md` is generated by `next dev` (Next 16 behaviour); it only tells coding agents to read Next's bundled docs. Safe to keep or delete.

## Design decisions - do not change without asking Nipun
- Evidence labels, exactly: `user-defined`, `supported-by-examples`, `web-supported`, `inferred`. No confidence percentages.
- Precedence when signals conflict: user-defined > supported-by-examples > web-supported > inferred. Explicit user instructions always win; conflicts are listed for review, not silently resolved.
- "web-supported" means seen in the brand's own posts/campaigns (an OBSERVED research bullet tagged brand-owned). Third-party commentary (REPORTED) is weaker evidence: it may still shape a trait when specific and consistent across sources, but the trait is labelled "inferred". A label describes where a trait came from; it never decides whether a trait is allowed.
- Channel: the card is for X. Research looks at the brand's X account first, then Instagram. LinkedIn/corporate posts show the corporate voice; use them for the X voice only when nothing else exists, and list that in assumptions.
- Voice examples must be real: code keeps one only if it appears word for word in the pasted posts or the research EXAMPLE PHRASES, and sets its source label from where it was found (`verifyVoiceExamples`).
- Critic scores are NOT shown to users. The critic is a revision aid; quality evidence comes from code checks and manual review.
- Research is optional and must never block a run.
- Never invent offers, prices, dates, stats or claims not in the user's brief.

## Model decision (set in .env and .env.example)
Decided 24 Oct 2026 after a side-by-side run on zomato and millet (mini vs gpt-5.6-sol):
- research = `gpt-5-mini`: cost is dominated by the search calls, so a bigger model buys nothing; what it can reach is the limit, not the model.
- analysis = `gpt-5.6-sol`: labelled sources correctly (mini tagged research lines as `pasted-post`), refused to treat commentary as brand evidence, flagged missing evidence in assumptions.
- tweets = `gpt-5.6-sol`: far fewer invented specifics (mini invented flavours, app steps, health claims, "link in bio") and no repeated CTAs. It was too safe, which the personality rule in TWEET_INSTRUCTIONS addresses.
- critic = `gpt-5.6-sol`: mini's critic only swapped CTA words and left the problem; Sol rewrites. Least clear call; it can be switched off if cost matters.
- `gpt-5.6-sol` pricing ($5 in / $30 out per M) is UNVERIFIED, taken from third-party pages; check the OpenAI pricing page and the dashboard. Prices live in `MODEL_PRICES` in lib/config.js.
- Not tested: `gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini` as cheaper middle options.

## Prompts are LOCKED (24 Oct 2026)
lib/prompts.js, the angle list in lib/plan.js and the check thresholds are frozen while the app is built. Do not tune them without asking Nipun. Bug fixes only. Final state of the last review rounds:
- Tweet quality was reviewed on zomato-posts and millet with the Sol setup. Best results come from pasted posts; research alone gives a weaker voice.
- The revision guard now checks the whole set (a rewrite had created a repeated opening in another tweet). The fix is covered by an offline test but has NOT been re-run on a paid run; the app's end-to-end run is the validation.
- invented_number exempts witty slots (except money and %) because exaggeration is a joke device; other styles read numbers as claims.

## Limitations (for the doc)
- The `(brand-owned: ...)` tag on research bullets is model-asserted and can't be verified in code. Several tagged bullets cite news articles, so `web-supported` can overstate how first-hand the evidence is. Only EXAMPLE PHRASES copied from a brand's archived posts are first-hand.
- `user-defined` labels are not checked in code. The model sometimes applies the label to its own restatement of the brief; the prompt now forbids it, but only manual review catches slips.
- Research can't open a brand's X timeline directly. It relies on archive pages and news quotes, so it may miss the brand's current voice. Pasted posts are far stronger evidence than research.
- Voice-example verification checks exact text only. It confirms a line is real, not that it is typical of the brand.
- `invented_number` reads digits only, not spelled-out numbers ("twelve" is only caught next to a time unit), and it checks numbers, not other invented claims (features, flavours, health claims). The critic and manual review cover those.
- The brand-name check counts literal mentions of the brand name, not handles or nicknames.
- Theme rotation assigns themes by slot position, not by fit with the slot's style, so a theme can sit awkwardly with an angle. The writer may combine it with a brand hook.
- Idea spread is enforced by design (themes, angles) plus a prompt rule, not by a code check. Tweets can still lean on one product fact (for example "six flavours") in many slots.
- witty slots may use invented counts and durations; a witty tweet could still state a false-looking number as a joke.
- Cost is an estimate from a price table; `gpt-5.6-sol` pricing is unverified.
- The rate limiter and research cache are in-memory, so on a serverless host they are per instance and reset on cold starts or redeploys. They stop casual abuse and loops, not a determined attacker; a hard limit needs a shared store (for example Redis). The IP comes from `x-forwarded-for`, which is only trustworthy behind the host's proxy (as on Vercel).
- A visitor can still run the full pipeline ~5 times an hour per instance. Worst-case spend is bounded by that, not by a budget cap; set a spend limit in the OpenAI dashboard before sharing the link.
- CRED has no direct X posts in research, so its "real lines" are headlines from CRED's own newsroom (brand-owned, but press-release text, not tweets). The card's assumptions say so, but the Voice Card page labels them "found online" next to real-lines wording that implies posts.
- Blind eval (24 Oct 2026): a gpt-5.4 judge, told exactly 6 of 12 lines were real, scored 33%, 50% and 33% over three shuffles (average 38.9%; 50% is chance). It was fooled by polished generated tweets and distrusted the rougher real posts. Treat it as indicative only: 12 lines, three shuffles of the same lines (not independent), one judge model, and the generator had seen the same 6 real posts.
- The editable Voice Card changes what the writer sees, but an edit cannot add evidence: edited tone traits are simply labelled `user-defined`.
- The critic guard accepts a revision when it adds no new issue code to that tweet or any other. A revision can be accepted and still be weak, and one with a real fix can be rejected for tripping a different check (rejections are recorded).
- Quality evidence is a handful of brands and runs by one reviewer; output varies run to run. The same joke can recur across runs.
- CRED's X feed is mostly ads, so no pasted-post test exists for it.
- Angle templates recur across brands: the same four angles per style are reused for every brand, so tweets in different sets can share a shape (this-or-that, fill in the blank, fake equation).
- Research sources are listed for the whole lookup but not attached to individual findings, so a trait labelled `web-supported` cannot be traced to one source.
- The Max tweet length field is enforced in code (too_long), but a length written inside the free-text instructions ("under 100 characters") is still only followed by the writer, not checked.
- `humour_allowed` is the model's reading of the user's tone words and instructions; nothing in code verifies it, and a ban expressed in unusual wording can be missed. The card has a "Humour allowed" toggle (style rules) to override it; changing it is a card edit and shows a user-defined chip.
- The conflict banner's winner is read from resolution wording by keyword; unclear wording gets the neutral line.
- An outdated tweet set can still be copied or have single tweets regenerated (from its own snapshot) until it is rebuilt.

## Budget - important
The API budget is limited, and a full run with research is the costly case.
- Ask before running more than 3 paid pipeline runs in a row.
- Use `--no-search` while iterating on tweet/critic prompts.
- Report estimated cost after every paid run.
- In the deployed app: rate-limit per visitor and cache research per brand name.

## Rules
- Never print, log, or commit the API key. `.env` is gitignored; keep it that way.
- Keep prompts in lib/prompts.js only (they are quoted in the approach doc).
- Node 20.6+, ES modules, plain JS in lib/ so scripts and the Next.js app share the same code.

## Commands
- `npm run dev` / `npm run build` / `npm start` - the web app (needs `.env`; `npm run dev` serves http://localhost:3000)
- `SHOT_TAG=-v2 node scripts/screenshots.mjs sample` - free screenshots (desktop + 390px mobile) of the app via headless Chrome (outputs/screenshots/); `node scripts/screenshots.mjs e2e` is a REAL paid run through the UI (research, generate, one regenerate)
- `node scripts/fake-openai.mjs` + `OPENAI_BASE_URL=http://localhost:4010 OPENAI_API_KEY=fake npm run dev` - a fake OpenAI server so the whole UI (streaming, regenerate, cached research) can be exercised with no key and no cost
- `APP_URL=<deployed url> node scripts/live-check.mjs` - timed pass through a LIVE deployment; MAKES PAID CALLS (one full run + one regenerate)
- `node --env-file=.env scripts/eval-real-vs-generated.mjs` - blind eval (judge gpt-5.4 vs the Zomato real posts and the first 6 generated tweets); small paid calls; writes outputs/human-test.txt and outputs/human-test-answers.txt
- `node scripts/make-favicon.mjs` - rebuilds app/favicon.ico from app/icon.svg
- `node scripts/make-sample.mjs <outputs/file.json> <name>` - turn a saved run into `public/samples/<name>.json`
- `npm run check-access` - which models work, whether web search works (tiny cost)
- `npm run test:offline` - mock-client tests for checks, plan, pipeline (free, no key)
- `npm run test:pipeline -- <zomato|cred|millet|zomato-rebrand|zomato-posts> [--no-search] [--no-critic] [--model <id>] [--reuse-research <outputs file>]`
  (`zomato-posts` has 6 real Zomato tweets pasted in pastPosts, one per line, max 3000 chars. `cred` stays name-only: CRED's X feed is mostly ads, so one organic post wasn't enough for a posts variant)
- Results are saved to `outputs/` (gitignored); the best ones become examples in the doc.

## Plan / status
- [x] Core pipeline + offline tests
- [x] Verify API access; per-run cost estimated (confirm against the dashboard)
- [x] Model comparison; models chosen (see Model decision)
- [x] Run zomato, zomato-posts, millet with the Sol setup; review tweets; prompts locked
- [~] Whole-set revision guard: the app's end-to-end run finished 10/10 with 5 accepted revisions and no new failures, which is consistent with the fix but is one run, not proof.
- [x] Next.js app: form, editable Voice Card (evidence labels, conflict notice, sources), 10 tweet cards (style tag, "revised" tag, copy, regenerate one), rate limit. One real end-to-end run through the UI done locally (analyze 48s, generate 26s, regenerate 7s; 10/10 checks, 5 revisions).
- [x] Deployed to Vercel (https://brand-voice-tweets.vercel.app) and tested live: streaming progress works, no console errors, usage lines read from Vercel logs.
- [x] Final example runs (zomato-posts, zomato, cred, millet) saved; three free samples with a picker; blind eval run; human test file written (outputs/human-test.txt, key in outputs/human-test-answers.txt)
- [ ] Google Doc: live link, approach, prompts, 3 brand examples, screenshots, checks + manual review, limitations
