// Deterministic quality checks. These are evidence that does not depend on a model's opinion.

const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
const PICTO = /\p{Extended_Pictographic}/u;
const WIDE = /[ᄀ-ᇿ⺀-鿿가-힯豈-﫿＀-￯]/u;
const URL_RE = /https?:\/\/\S+/g;

export const MAX_LENGTH = 280;
const EMOJI_MAX = { none: 0, light: 2, heavy: 6 };
const HASHTAG_MAX = { none: 0, light: 1, moderate: 3 };

const GENERIC_PHRASES = [
  'elevate', 'unleash', 'unlock', 'game-changer', 'game changer', 'look no further',
  "in today's world", 'in today’s world', 'revolutionize', 'revolutionise', 'delve', 'seamless',
  'understood the assignment', 'level up', 'snack game', 'vibe check', 'main character', 'hits different', 'no cap',
];

const INSTRUCTION_LEAK_RE = /\b(hinglish|voice card|style rules?|call to action|cta|slot \d|avoid_words)\b/i;
// Phrasing that only works on Instagram (or similar), not in a tweet.
const PLATFORM_MISMATCH_RE = /\b(links? in (?:our |my |the |your )?bio|bio links?|swipe up|double[- ]tap|tap twice|(?:in|on|check|see) (?:our|my|the) stor(?:y|ies)|story highlights?)\b/i;
const REPEATED_PHRASE_WORDS = 4;
const REPEATED_PHRASE_TWEETS = 3;
const BRAND_NAME_MAX_TWEETS = 4;

// invented_number: any number in a tweet must come from the BRIEF. Exempt: list markers (1. 2) 3.) and plain
// counts from 1 to 10. Money, percentages and times/durations ("12 minutes", "5 pm") are always checked.
const NUMBER_WORDS = 'one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|ninety|hundred';
const UNIT = '(?:min(?:ute)?s?|hours?|hrs?|sec(?:ond)?s?|days?|weeks?|months?|years?|a\\.?m\\.?|p\\.?m\\.?)';
const LIST_MARKER_RE = /(?:^|\s)\d{1,2}[.)](?=\s)/g;
const MONEY_RE = /(?:[₹$]\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:%|rs\.?|rupees|inr)(?![\p{L}\d]))/giu;
const DURATION_RE = new RegExp(`(?<![\\p{L}\\d])(?:\\d+(?::\\d{2})?|${NUMBER_WORDS})\\s?${UNIT}(?![\\p{L}\\d])`, 'giu');
const PLAIN_NUMBER_RE = /(?<![\p{L}\d])\d[\d,]*(?:\.\d+)?(?![\p{L}\d])/gu;

const squash = (s) => s.toLowerCase().replace(/\s+/g, '');

// Witty tweets may exaggerate with numbers ("47 menus"), so for them only money and percentages are checked.
// Promotional, informative and engaging tweets read numbers as claims, so everything is checked.
function inventedNumbers(text, brief, { moneyOnly = false } = {}) {
  const briefSquashed = squash(brief);
  const briefNumbers = new Set((brief.match(PLAIN_NUMBER_RE) || []).map((n) => n.replace(/,/g, '')));
  const found = [];
  let rest = text.replace(LIST_MARKER_RE, ' ');
  for (const re of moneyOnly ? [MONEY_RE] : [MONEY_RE, DURATION_RE]) {
    rest = rest.replace(re, (m) => {
      if (!briefSquashed.includes(squash(m))) found.push(m.trim());
      return ' ';
    });
  }
  if (moneyOnly) return found;
  for (const m of rest.match(PLAIN_NUMBER_RE) || []) {
    const n = m.replace(/,/g, '');
    if (Number.isInteger(Number(n)) && Number(n) >= 1 && Number(n) <= 10) continue;
    if (!briefNumbers.has(n)) found.push(m);
  }
  return found;
}

const STOPWORDS = new Set(
  'a an the and or but if of to in on at for with by from is are was were be been it its this that these those you your we our us i me my they their them he she his her as so just not no do does did have has had can will would should could than then there here what when where who how why all any some more most very too up out about into over'.split(' ')
);

// Approximates X's weighted count: URLs count 23, emoji and CJK count 2, everything else 1.
export function tweetLength(text) {
  let len = 0;
  const withoutUrls = text.replace(URL_RE, () => {
    len += 23;
    return '';
  });
  for (const { segment } of segmenter.segment(withoutUrls)) {
    len += PICTO.test(segment) || WIDE.test(segment) ? 2 : 1;
  }
  return len;
}

export function countEmoji(text) {
  let n = 0;
  for (const { segment } of segmenter.segment(text)) if (PICTO.test(segment)) n++;
  return n;
}

export function countHashtags(text) {
  return (text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsPhrase(text, phrase) {
  if (!phrase?.trim()) return false;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(phrase.trim())}(?![\\p{L}\\p{N}])`, 'iu');
  return re.test(text);
}

function contentWords(text) {
  return new Set(
    text.toLowerCase().replace(URL_RE, '').split(/[^\p{L}\p{N}']+/u).filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

// Every run of 4 consecutive words (lowercased, punctuation stripped) in a tweet.
function fourGrams(text) {
  const w = text.toLowerCase().replace(URL_RE, '').split(/[^\p{L}\p{N}']+/u).filter(Boolean);
  const grams = new Set();
  for (let i = 0; i + REPEATED_PHRASE_WORDS <= w.length; i++) grams.add(w.slice(i, i + REPEATED_PHRASE_WORDS).join(' '));
  return grams;
}

function firstWord(text) {
  const m = text.trim().toLowerCase().match(/[\p{L}\p{N}']+/u);
  return m ? m[0] : '';
}

function normalizeForMatch(s = '') {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…|\.{3}/g, ' ')
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim();
}

// The EXAMPLE PHRASES section of the research notes: the only research text a voice example may come from.
function examplePhrasesSection(notes = '') {
  const m = notes.match(/EXAMPLE PHRASES([\s\S]*?)(?=\n[\s*#]*(?:REPORTED|GAPS)\b|$)/i);
  return m ? m[1] : '';
}

// Voice examples must be real lines. Keep one only if it appears word for word in the pasted posts or the
// research EXAMPLE PHRASES, and set its source label from where it was actually found.
export function verifyVoiceExamples(card, inputs, research) {
  const pasted = normalizeForMatch(inputs?.pastPosts);
  const found = research?.status === 'found' ? normalizeForMatch(examplePhrasesSection(research.notes)) : '';
  const warnings = [];
  const kept = [];
  for (const ex of card.voice_examples || []) {
    const n = normalizeForMatch(ex.text);
    const actual = !n ? null : pasted.includes(n) ? 'pasted-post' : found.includes(n) ? 'brand-post-from-research' : null;
    if (!actual) {
      warnings.push(`Dropped voice example not found in the pasted posts or research: "${ex.text}"`);
      continue;
    }
    if (actual !== ex.source) warnings.push(`Relabelled voice example source ${ex.source} -> ${actual}: "${ex.text}"`);
    kept.push({ ...ex, source: actual });
  }
  return { card: { ...card, voice_examples: kept }, warnings };
}

// Checks that only need the tweet itself and the Voice Card.
// ctx = { brief, brandName } is optional; without it the BRIEF-based checks are skipped.
// style is the slot's style; it only changes how strictly numbers are checked.
export function checkTweet(text, card, ctx, style) {
  const issues = [];
  const rules = card?.style_rules || {};
  const length = tweetLength(text);
  if (!text.trim()) issues.push({ code: 'empty', message: 'Tweet is empty' });
  const maxLength = ctx?.maxLength ?? MAX_LENGTH;
  if (length > maxLength) issues.push({ code: 'too_long', message: `Too long: ${length}/${maxLength} characters` });

  const emoji = countEmoji(text);
  const emojiMax = EMOJI_MAX[rules.emoji_use] ?? 2;
  if (emoji > emojiMax) issues.push({ code: 'emoji', message: `${emoji} emoji; voice allows ${emojiMax} (${rules.emoji_use})` });

  const tags = countHashtags(text);
  const tagMax = HASHTAG_MAX[rules.hashtag_use] ?? 1;
  if (tags > tagMax) issues.push({ code: 'hashtags', message: `${tags} hashtags; voice allows ${tagMax} (${rules.hashtag_use})` });

  for (const w of card?.avoid_words || []) {
    if (containsPhrase(text, w)) issues.push({ code: 'avoid_word', message: `Uses avoided word "${w}"` });
  }

  const signature = (rules.signature_patterns || []).join(' ').toLowerCase();
  for (const p of GENERIC_PHRASES) {
    if (containsPhrase(text, p) && !signature.includes(p)) issues.push({ code: 'generic', message: `Generic AI phrasing "${p}"` });
  }

  if (/\[[^\]]+\]/.test(text)) issues.push({ code: 'placeholder', message: 'Contains placeholder text in brackets' });

  if (ctx?.brief !== undefined) {
    for (const n of inventedNumbers(text, ctx.brief, { moneyOnly: style === 'witty' })) issues.push({ code: 'invented_number', message: `Number "${n}" is not in the brief` });
  }

  const platform = text.match(PLATFORM_MISMATCH_RE);
  if (platform) issues.push({ code: 'platform_mismatch', message: `Instagram-style phrasing doesn't work on X ("${platform[0]}")` });

  const leak = text.match(INSTRUCTION_LEAK_RE);
  if (leak) issues.push({ code: 'instruction_leak', message: `Instruction text leaked into the tweet ("${leak[0]}")` });

  return { length, emoji, hashtags: tags, issues };
}

// Checks across the whole set: duplicates, repeated openings, and whether the style mix matches the plan.
export function checkSet(tweets, card, plan, ctx) {
  const perTweet = tweets.map((t) => ({ slot: t.slot, ...checkTweet(t.text, card, ctx, t.style) }));
  let brandNamed = 0;
  const words = tweets.map((t) => contentWords(t.text));
  const grams = tweets.map((t) => fourGrams(t.text));
  const gramCount = new Map();
  for (const g of grams) for (const p of g) gramCount.set(p, (gramCount.get(p) || 0) + 1);

  for (let j = 0; j < tweets.length; j++) {
    for (let i = 0; i < j; i++) {
      const sim = jaccard(words[i], words[j]);
      if (sim > 0.5) {
        perTweet[j].issues.push({ code: 'duplicate', message: `Too similar to tweet ${tweets[i].slot} (${Math.round(sim * 100)}% word overlap)` });
        break;
      }
    }
    // A phrase in 3+ tweets is flagged on the 3rd tweet onward (the ones that repeat it a second time or more).
    const shared = [...grams[j]].find((p) => {
      if (gramCount.get(p) < REPEATED_PHRASE_TWEETS) return false;
      return grams.slice(0, j).filter((g) => g.has(p)).length >= REPEATED_PHRASE_TWEETS - 1;
    });
    if (shared) perTweet[j].issues.push({ code: 'repeated_phrase', message: `Phrase "${shared}" appears in ${gramCount.get(shared)} tweets` });

    // The brand doesn't need to name itself: flag from the 5th tweet that does.
    if (ctx?.brandName && containsPhrase(tweets[j].text, ctx.brandName)) {
      brandNamed++;
      if (brandNamed > BRAND_NAME_MAX_TWEETS) {
        perTweet[j].issues.push({ code: 'brand_name_overuse', message: `Names the brand; it is already named in ${BRAND_NAME_MAX_TWEETS} earlier tweets` });
      }
    }

    const fw = firstWord(tweets[j].text);
    const earlier = tweets.slice(0, j).find((t) => firstWord(t.text) === fw);
    if (fw && earlier) perTweet[j].issues.push({ code: 'same_opening', message: `Opens with "${fw}", same as tweet ${earlier.slot}` });
  }

  const actualMix = {};
  for (const t of tweets) actualMix[t.style] = (actualMix[t.style] || 0) + 1;
  const mixMatches = plan ? Object.entries(plan.mix).every(([s, n]) => (actualMix[s] || 0) === n) : true;

  const passed = perTweet.filter((p) => p.issues.length === 0).length;
  return {
    perTweet,
    summary: { total: tweets.length, passed, failed: tweets.length - passed, countOk: tweets.length === 10, actualMix, mixMatches },
  };
}
