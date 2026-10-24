export const STYLES = ['engaging', 'promotional', 'witty', 'informative'];

// The 10-tweet mix is decided in code, not left to the model, so it is predictable and explainable.
export const MIXES = {
  engagement: { engaging: 4, witty: 3, informative: 2, promotional: 1 },
  promotion: { promotional: 4, engaging: 2, witty: 2, informative: 2 },
  awareness: { informative: 3, witty: 3, engaging: 2, promotional: 2 },
  launch: { promotional: 3, engaging: 3, informative: 2, witty: 2 },
  balanced: { engaging: 3, witty: 3, promotional: 2, informative: 2 },
};

// Each slot gets a different angle so tweets of the same style don't collapse into one template.
export const ANGLES = {
  engaging: ['this-or-that choice', 'fill in the blank', 'relatable confession question', 'hot take that invites debate'],
  promotional: ['hero product benefit', 'occasion or use-case', 'what makes it different (only from the brief)', 'easy first step to try or buy'],
  witty: [
    "meme or parody format that fits the voice: a fake equation, 'POV:', a fake notice or announcement, 'nobody: / me:', a chapter title. Don't default to 'POV: you opened [app]'",
    'wordplay on the product or category',
    'playful exaggeration of a relatable habit',
    'the brand talking to its audience like a friend',
  ],
  informative: ['practical tip', 'how-to in 2-3 steps', 'behind the product (only from the brief)', 'did-you-know about the category (no health or medical claims)'],
};

export function normalizeObjective(objective = '') {
  const o = objective.toLowerCase();
  if (/launch/.test(o)) return 'launch';
  if (/promo|sale|offer|convert|conversion|sell/.test(o)) return 'promotion';
  if (/aware|reach|visib|brand/.test(o)) return 'awareness';
  if (/engag|community|conversation|reply/.test(o)) return 'engagement';
  return 'balanced';
}

// Interleave styles round-robin so the feed never shows four promos in a row.
// themes = the Voice Card's content_themes. Each slot gets one in rotation, so ideas are spread by design.
export function planMix(objective, themes = []) {
  const key = normalizeObjective(objective);
  const remaining = { ...MIXES[key] };
  const order = Object.keys(remaining).sort((a, b) => remaining[b] - remaining[a]);
  const slots = [];
  while (slots.length < 10) {
    for (const style of order) {
      if (remaining[style] > 0 && slots.length < 10) {
        slots.push({ slot: slots.length + 1, style });
        remaining[style] -= 1;
      }
    }
  }
  // The nth slot of a style gets ANGLES[style][n % length].
  const seen = {};
  for (const s of slots) {
    const n = seen[s.style] || 0;
    s.angle = ANGLES[s.style][n % ANGLES[s.style].length];
    seen[s.style] = n + 1;
  }
  slots.forEach((s, i) => {
    const t = themes.length ? themes[i % themes.length] : null;
    s.theme = t ? t.theme : '';
    s.themeDetail = t ? t.detail || '' : '';
  });
  return { objectiveKey: key, mix: MIXES[key], slots };
}
