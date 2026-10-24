// Blind eval: can a judge model tell Zomato's real posts from the tool's generated tweets?
//
//  - 6 real Zomato posts (the pastPosts of "zomato-posts" in scripts/test-brands.json)
//  - the FIRST 6 tweets by slot from a zomato-posts run (not the best 6)
//  - shuffled 3 ways; the judge (gpt-5.4 by default, NOT the model that wrote the tweets) is told exactly 6 are real
//    and labels every line "real" or "generated" with a one-line reason.
//  Accuracy 50% = chance. Also reports which generated tweets fooled the judge most often.
//  It also writes outputs/human-test.txt (12 lines, one shuffled order, numbered) and outputs/human-test-answers.txt
//  (the key, kept apart) so the same test can be sent to people.
//
// Usage: node --env-file=.env scripts/eval-real-vs-generated.mjs [outputs/zomato-posts-....json]
// Env:   JUDGE_MODEL (default gpt-5.4)
// This makes 3 small paid OpenAI calls (one per shuffle).
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['labels'],
  properties: {
    labels: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'label', 'reason'],
        properties: { id: { type: 'integer' }, label: { type: 'string', enum: ['real', 'generated'] }, reason: { type: 'string' } },
      },
    },
  },
};

export const JUDGE_INSTRUCTIONS = `You are judging a blind test.
Below are 12 short posts, presented as lines from the same brand's X (Twitter) account: Zomato, an Indian food delivery and dining-out app.
EXACTLY 6 of them were written by the brand's real social media team and actually posted.
EXACTLY 6 were written by an AI model imitating that team.
Label every line "real" or "generated" (so exactly 6 of each) and give a one-line reason for each. Judge only the text of each line.`;

// Small seeded PRNG (mulberry32) so a shuffle can be reproduced from its seed.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle(items, seed) {
  const rand = seededRandom(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// order: the shuffled items shown to the judge (each has a `truth` of 'real' | 'generated').
// labels: the judge's [{ id (1-based position), label, reason }].
export function scoreRun(order, labels) {
  const byId = new Map(labels.map((l) => [l.id, l]));
  const lines = order.map((item, i) => {
    const l = byId.get(i + 1);
    return { ...item, position: i + 1, judged: l?.label ?? 'missing', reason: l?.reason ?? '', correct: l?.label === item.truth };
  });
  const correct = lines.filter((l) => l.correct).length;
  return { lines, correct, accuracy: correct / order.length, judgedReal: lines.filter((l) => l.judged === 'real').length };
}

async function main() {
  const brands = JSON.parse(await readFile(new URL('./test-brands.json', import.meta.url), 'utf8'));
  const realPosts = brands['zomato-posts'].pastPosts.split('\n').map((s) => s.trim()).filter(Boolean);
  if (realPosts.length !== 6) throw new Error(`Expected 6 real posts, found ${realPosts.length}`);

  let file = process.argv[2];
  if (!file) {
    const dir = new URL('../outputs/', import.meta.url);
    const names = (await readdir(dir)).filter((n) => /^zomato-posts-.*\.json$/.test(n)).sort();
    if (!names.length) throw new Error('No outputs/zomato-posts-*.json found. Run: npm run test:pipeline -- zomato-posts');
    file = new URL(names.at(-1), dir).pathname;
  }
  const run = JSON.parse(await readFile(file, 'utf8'));
  // The FIRST 6 by slot, as the tool produced them (after the editor pass), not the best 6.
  const generated = [...run.tweets].sort((a, b) => a.slot - b.slot).slice(0, 6);

  const items = [
    ...realPosts.map((text, i) => ({ text, truth: 'real', origin: `real post ${i + 1}` })),
    ...generated.map((t) => ({ text: t.text.trim(), truth: 'generated', origin: `generated slot ${t.slot}` })),
  ];
  console.log(`Run used: ${file.split('/').pop()}`);
  console.log(`Judge: ${process.env.JUDGE_MODEL || 'gpt-5.4'}; ${items.length} lines (6 real, 6 generated)\n`);

  const { callModel, createMeter } = await import('../lib/openai.js');
  const judge = process.env.JUDGE_MODEL || 'gpt-5.4';
  const meter = createMeter();
  const runs = [];
  for (const seed of [11, 22, 33]) {
    const order = shuffle(items, seed);
    const input = order.map((it, i) => `${i + 1}. ${it.text}`).join('\n');
    const res = await callModel({
      step: 'judge',
      model: judge,
      instructions: JUDGE_INSTRUCTIONS,
      input,
      schema: JUDGE_SCHEMA,
      schemaName: 'judge',
      meter,
    });
    const scored = scoreRun(order, JSON.parse(res.output_text).labels);
    runs.push({ seed, ...scored });
    console.log(`Shuffle ${runs.length} (seed ${seed}): ${scored.correct}/12 correct = ${(scored.accuracy * 100).toFixed(0)}%  (judge called ${scored.judgedReal} lines "real")`);
  }
  const avg = runs.reduce((s, r) => s + r.accuracy, 0) / runs.length;
  console.log(`\nAverage accuracy: ${(avg * 100).toFixed(1)}%   (50% = chance)\n`);

  // Per line: how often the judge got it right, across the 3 shuffles.
  const stats = items.map((it) => {
    const seen = runs.map((r) => r.lines.find((l) => l.text === it.text));
    return { ...it, timesJudgedReal: seen.filter((l) => l.judged === 'real').length, reasons: seen.map((l) => l.reason) };
  });
  console.log('GENERATED tweets, by how often they were mistaken for real (3 shuffles):');
  for (const s of stats.filter((x) => x.truth === 'generated').sort((a, b) => b.timesJudgedReal - a.timesJudgedReal)) {
    console.log(`  fooled ${s.timesJudgedReal}/3  [${s.origin}]  ${s.text}`);
  }
  console.log('\nREAL posts, by how often they were mistaken for generated:');
  for (const s of stats.filter((x) => x.truth === 'real').sort((a, b) => (3 - b.timesJudgedReal) - (3 - a.timesJudgedReal))) {
    console.log(`  called generated ${3 - s.timesJudgedReal}/3  [${s.origin}]  ${s.text}`);
  }
  console.log('\nJudge reasons for the generated tweets that fooled it at least once:');
  for (const s of stats.filter((x) => x.truth === 'generated' && x.timesJudgedReal > 0)) {
    runs.forEach((r, i) => {
      const l = r.lines.find((x) => x.text === s.text);
      if (l.judged === 'real') console.log(`  [${s.origin}] shuffle ${i + 1}: ${l.reason}`);
    });
  }
  const tokens = meter.calls.reduce((t, c) => ({ in: t.in + c.inputTokens, out: t.out + c.outputTokens }), { in: 0, out: 0 });
  console.log(`\nJudge tokens: ${tokens.in} in, ${tokens.out} out (${judge} is not in the price table, so no cost estimate)`);

  // Same 12 lines for people: one shuffled order, key kept in a separate file.
  const humanOrder = shuffle(items, 77);
  const test = [
    'REAL OR AI?',
    '',
    "Below are 12 short posts. 6 are real posts from Zomato's X account. The other 6 were written by an AI that was asked to imitate Zomato's style.",
    'For each number, write R (real) or A (AI). Exactly 6 of each. Go with your gut, and no looking things up.',
    'Reply with your answers like: 1 R, 2 A, 3 A ...',
    '',
    ...humanOrder.map((it, i) => `${i + 1}. ${it.text}`),
    '',
  ].join('\n');
  const key = [
    'ANSWER KEY (do not send this file)',
    '',
    ...humanOrder.map((it, i) => `${i + 1}. ${it.truth === 'real' ? 'R (real)' : 'A (AI)'}  [${it.origin}]  ${it.text}`),
    '',
  ].join('\n');
  await mkdir(new URL('../outputs/', import.meta.url), { recursive: true });
  await writeFile(new URL('../outputs/human-test.txt', import.meta.url), test);
  await writeFile(new URL('../outputs/human-test-answers.txt', import.meta.url), key);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = `outputs/eval-real-vs-generated-${stamp}.json`;
  await writeFile(new URL(`../${out}`, import.meta.url), JSON.stringify({ judge, sourceRun: file.split('/').pop(), average: avg, runs, stats }, null, 2));
  console.log(`\nWrote outputs/human-test.txt, outputs/human-test-answers.txt and ${out}`);
}

// Only run when executed directly (so the helpers can be imported by tests).
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
