// USD per million tokens, used only to ESTIMATE cost (the dashboard is the real number).
// gpt-5.6-sol is UNVERIFIED: taken from third-party pricing pages (Oct 2026). Check OpenAI's pricing page.
// Models not listed fall back to PRICE_INPUT_PER_M / PRICE_OUTPUT_PER_M.
export const MODEL_PRICES = {
  'gpt-5-mini': { inputPerM: 0.25, outputPerM: 2.0 },
  'gpt-5.6-sol': { inputPerM: 5.0, outputPerM: 30.0 },
};

// Read lazily so values from .env (scripts) or Vercel env vars (app) are picked up at call time.
export function getConfig() {
  const fallback = process.env.MODEL_DEFAULT || 'gpt-5-mini';
  return {
    models: {
      research: process.env.MODEL_RESEARCH || fallback,
      analysis: process.env.MODEL_ANALYSIS || fallback,
      tweets: process.env.MODEL_TWEETS || fallback,
      critic: process.env.MODEL_CRITIC || fallback,
    },
    reasoningEffort: process.env.REASONING_EFFORT || 'low',
    pricing: {
      models: MODEL_PRICES,
      inputPerM: Number(process.env.PRICE_INPUT_PER_M || 0.25),
      outputPerM: Number(process.env.PRICE_OUTPUT_PER_M || 2.0),
      perSearch: Number(process.env.PRICE_PER_SEARCH || 0.01),
    },
  };
}

// Caps keep cost predictable and limit how much pasted text reaches the model.
export const INPUT_LIMITS = {
  brandName: 80,
  industry: 120,
  objective: 120,
  products: 1500,
  toneWords: 200,
  pastPosts: 3000,
  instructions: 800,
  website: 200,
  audience: 300,
};

// Optional "Max tweet length": a number from 60 to 280; anything missing or unreadable means the default, 280.
export const TWEET_LENGTH = { min: 60, max: 280 };
export function normalizeMaxLength(value) {
  const n = parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(n) ? Math.min(TWEET_LENGTH.max, Math.max(TWEET_LENGTH.min, n)) : TWEET_LENGTH.max;
}
