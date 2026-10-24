// What the browser shows as current or outdated, kept free of React so it can be tested offline.
//
// Every Voice Card and every tweet set remembers the brief (and, for tweets, the card) it was built from.
// Names and summaries shown next to a result come from that snapshot, never from the live form.

// Brief fields that change what the Voice Card says. A change to any of them (the objective included, which
// decides the tweet mix) makes the card and the tweets built from it outdated.
export const BRIEF_KEYS = ['brandName', 'industry', 'objective', 'products', 'toneWords', 'pastPosts', 'instructions'];

export function snapshotInputs(inputs = {}) {
  const snap = {};
  for (const key of BRIEF_KEYS) snap[key] = typeof inputs[key] === 'string' ? inputs[key].trim() : '';
  snap.research = inputs.research !== false;
  return snap;
}

export function briefChanged(a, b) {
  const x = snapshotInputs(a);
  const y = snapshotInputs(b);
  return BRIEF_KEYS.some((k) => x[k] !== y[k]) || x.research !== y.research;
}

// Empty tone traits (added but never filled in) don't count as part of the card.
export function cleanCard(card) {
  return { ...card, tone: (card.tone || []).filter((t) => t.trait.trim()) };
}

export function cardChanged(a, b) {
  return JSON.stringify(cleanCard(a)) !== JSON.stringify(cleanCard(b));
}

// cardSnap = { inputs } the brief the current card was built from.
// tweetSnap = { inputs, card } the brief and card the current tweet set was written from.
// Returns { cardOutdated, tweets: null | 'brief' | 'card' }. A brief change wins over a card edit,
// because only rebuilding the card fixes it.
export function staleness({ inputs, card, cardSnap, tweetSnap }) {
  const cardOutdated = Boolean(cardSnap) && briefChanged(inputs, cardSnap.inputs);
  let tweets = null;
  if (tweetSnap) {
    if (briefChanged(inputs, tweetSnap.inputs)) tweets = 'brief';
    else if (card && cardChanged(card, tweetSnap.card)) tweets = 'card';
  }
  return { cardOutdated, tweets };
}

export const OUTDATED_TEXT = {
  brief: 'Outdated: your brief changed',
  card: 'Outdated: Voice Card changed. Regenerate to apply.',
};

// Names and summary for a tweet set, from its own snapshot.
export function tweetsDisplay(tweetSnap) {
  return {
    brandLabel: tweetSnap.inputs.brandName.trim() || 'Your brand',
    displayName: tweetSnap.card.brand_display_name,
    summary: tweetSnap.card.voice_summary,
  };
}

// One line for the conflict banner, built from what the recorded resolutions actually say.
// If they don't clearly agree on a winner, say so neutrally instead of guessing.
const WINNERS = [
  ['your instructions', /\b(follow(ed|ing)?|kept|keep|respect(ed)?|prioriti[sz]ed?|honou?red|applied|used)\b[^.]*\b(user|your)\b|\b(user|your)\b[^.]*\b(instruction|request|tone words?|wording|stated|explicit)/i],
  ['your posts', /\b(follow(ed|ing)?|kept|keep|prioriti[sz]ed?|used|used the|based on)\b[^.]*\b(past|pasted|posts?|examples?)\b/i],
  ['research', /\b(follow(ed|ing)?|kept|keep|prioriti[sz]ed?|used)\b[^.]*\b(research|web|online)\b/i],
];

export function conflictSummary(conflicts = []) {
  const n = conflicts.length;
  const neutral = `${n} conflicting signal${n === 1 ? '' : 's'} reviewed. Details below.`;
  if (!n) return '';
  const winners = conflicts.map((c) => {
    const hits = WINNERS.filter(([, re]) => re.test(c.resolution || '')).map(([name]) => name);
    return hits.length === 1 ? hits[0] : null;
  });
  if (winners.some((w) => !w) || new Set(winners).size !== 1) return neutral;
  return `${n} conflicting signal${n === 1 ? '' : 's'} resolved in favour of ${winners[0]}`;
}
