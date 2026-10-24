// Validation for data that comes back from the browser (an edited Voice Card, the current tweets).
// The server never trusts it: unknown fields are dropped, enums are enforced and sizes are capped,
// so an edited card cannot smuggle extra fields into a prompt or inflate token costs.
import { VOICE_CARD_SCHEMA } from './schemas.js';
import { STYLES } from './plan.js';

const MAX_STRING = 600;
const MAX_ITEMS = 12;

function bad(path) {
  return new Error(`Invalid data at ${path}`);
}

function clean(value, schema, path) {
  switch (schema.type) {
    case 'string': {
      if (typeof value !== 'string') throw bad(path);
      if (schema.enum && !schema.enum.includes(value)) throw bad(path);
      return value.trim().slice(0, MAX_STRING);
    }
    case 'integer': {
      if (!Number.isInteger(value)) throw bad(path);
      return value;
    }
    case 'array': {
      if (!Array.isArray(value)) throw bad(path);
      return value.slice(0, MAX_ITEMS).map((v, i) => clean(v, schema.items, `${path}[${i}]`));
    }
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad(path);
      const out = {};
      for (const key of schema.required) out[key] = clean(value[key], schema.properties[key], `${path}.${key}`);
      return out;
    }
    default:
      throw bad(path);
  }
}

export function validateCard(card) {
  return clean(card, VOICE_CARD_SCHEMA, 'card');
}

const str = (v, path, max = MAX_STRING) => {
  if (typeof v !== 'string') throw bad(path);
  return v.trim().slice(0, max);
};

// The tweets the browser sends back (for regenerate): only the fields the pipeline reads.
export function validateTweets(tweets) {
  if (!Array.isArray(tweets) || tweets.length < 1 || tweets.length > 10) throw bad('tweets');
  const slots = new Set();
  return tweets.map((t, i) => {
    const p = `tweets[${i}]`;
    if (!t || typeof t !== 'object') throw bad(p);
    if (!Number.isInteger(t.slot) || t.slot < 1 || t.slot > 10 || slots.has(t.slot)) throw bad(`${p}.slot`);
    slots.add(t.slot);
    if (!STYLES.includes(t.style)) throw bad(`${p}.style`);
    return {
      slot: t.slot,
      style: t.style,
      angle: str(t.angle ?? '', `${p}.angle`, 300),
      theme: str(t.theme ?? '', `${p}.theme`, 200),
      text: str(t.text ?? '', `${p}.text`, 600),
      why: str(t.why ?? '', `${p}.why`, 300),
      revised: Boolean(t.revised),
      revisionReason: str(t.revisionReason ?? '', `${p}.revisionReason`, 300),
      originalText: str(t.originalText ?? '', `${p}.originalText`, 600),
    };
  });
}
