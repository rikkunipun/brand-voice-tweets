import { STYLES } from './plan.js';

// Strict structured outputs: every object lists all its properties as required
// and sets additionalProperties: false. Counts are enforced in prompts and code.

export const EVIDENCE = ['user-defined', 'supported-by-examples', 'web-supported', 'inferred'];

const str = { type: 'string' };
const strArr = { type: 'array', items: str };
const evidence = { type: 'string', enum: EVIDENCE };

const obj = (properties) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});

export const VOICE_CARD_SCHEMA = obj({
  brand_display_name: str,
  voice_summary: strArr,
  tone: { type: 'array', items: obj({ trait: str, detail: str, evidence }) },
  target_audience: obj({ description: str, evidence }),
  content_themes: { type: 'array', items: obj({ theme: str, detail: str, evidence }) },
  brand_hooks: { type: 'array', items: obj({ hook: str, evidence }) },
  voice_examples: {
    type: 'array',
    items: obj({ text: str, source: { type: 'string', enum: ['pasted-post', 'brand-post-from-research'] } }),
  },
  style_rules: obj({
    emoji_use: { type: 'string', enum: ['none', 'light', 'heavy'] },
    hashtag_use: { type: 'string', enum: ['none', 'light', 'moderate'] },
    language: str,
    sentence_style: str,
    signature_patterns: strArr,
  }),
  dos: strArr,
  donts: strArr,
  avoid_words: strArr,
  conflicts: {
    type: 'array',
    items: obj({ issue: str, user_says: str, signal_says: str, resolution: str }),
  },
  assumptions: strArr,
});

export const TWEETS_SCHEMA = obj({
  tweets: {
    type: 'array',
    items: obj({
      slot: { type: 'integer' },
      style: { type: 'string', enum: STYLES },
      text: str,
      why: str,
    }),
  },
});

export const CRITIC_SCHEMA = obj({
  reviews: {
    type: 'array',
    items: obj({
      slot: { type: 'integer' },
      verdict: { type: 'string', enum: ['keep', 'revise'] },
      reason: str,
      revised_text: str,
    }),
  },
});
