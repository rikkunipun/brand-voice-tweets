// Runs the full pipeline for one test brand, prints a readable report, and saves the raw result.
// Usage: npm run test:pipeline -- <brand> [--no-search] [--no-critic]
//   brands: zomato | cred | millet | zomato-rebrand (see test-brands.json)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { runPipeline } from '../lib/pipeline.js';
import { getConfig } from '../lib/config.js';

if (!process.env.OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY. Copy .env.example to .env and add your key.');
  process.exit(1);
}

const args = process.argv.slice(2);
const flagValue = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? '' : args[i + 1] || '';
};
const modelFlag = flagValue('--model');
const reuseFile = flagValue('--reuse-research');
const valueArgs = new Set([modelFlag, reuseFile].filter(Boolean));
const key = args.find((a) => !a.startsWith('--') && !valueArgs.has(a)) || 'zomato';
const skipResearch = args.includes('--no-search');
const critic = !args.includes('--no-critic');

// --model sets analysis, tweets and critic for this run. Research keeps MODEL_RESEARCH or the default.
if (modelFlag) {
  process.env.MODEL_RESEARCH = process.env.MODEL_RESEARCH || process.env.MODEL_DEFAULT || 'gpt-5-mini';
  process.env.MODEL_ANALYSIS = process.env.MODEL_TWEETS = process.env.MODEL_CRITIC = modelFlag;
}
const modelLabel = (modelFlag || getConfig().models.tweets).replace(/[^\w.-]/g, '_');

const brands = JSON.parse(await readFile(new URL('./test-brands.json', import.meta.url), 'utf8'));
if (!brands[key]) {
  console.error(`Unknown brand "${key}". Options: ${Object.keys(brands).join(', ')}`);
  process.exit(1);
}

if (key.endsWith('-posts') && !brands[key].pastPosts.trim()) {
  console.error(`"${key}" has no pastPosts yet. Paste real posts (one per line) into scripts/test-brands.json first.`);
  process.exit(1);
}

let savedResearch;
if (reuseFile) {
  savedResearch = JSON.parse(await readFile(reuseFile, 'utf8')).research;
  if (!savedResearch) {
    console.error(`No research found in ${reuseFile}`);
    process.exit(1);
  }
}

console.log(`\nRunning "${key}" (model: ${modelFlag || 'default'}, research: ${reuseFile ? `reused from ${reuseFile}` : skipResearch ? 'off' : 'on'}, critic: ${critic ? 'on' : 'off'})...\n`);
const result = await runPipeline(brands[key], { skipResearch, critic, research: savedResearch });
const { card, research, tweets, checks, plan, usage } = result;

const hr = () => console.log('-'.repeat(72));
hr();
console.log(`VOICE CARD: ${card.brand_display_name}`);
hr();
card.voice_summary.forEach((b) => console.log(`  • ${b}`));
console.log('\n  Tone:');
card.tone.forEach((t) => console.log(`    - ${t.trait} [${t.evidence}]: ${t.detail}`));
console.log(`\n  Audience [${card.target_audience.evidence}]: ${card.target_audience.description}`);
console.log('\n  Themes:');
card.content_themes.forEach((t) => console.log(`    - ${t.theme} [${t.evidence}]`));
console.log('\n  Brand hooks:');
card.brand_hooks.forEach((h) => console.log(`    - ${h.hook} [${h.evidence}]`));
console.log('\n  Voice examples:');
if (!card.voice_examples.length) console.log('    (none)');
card.voice_examples.forEach((v) => console.log(`    - "${v.text}" (${v.source})`));
const r = card.style_rules;
console.log(`\n  Style: emoji ${r.emoji_use}, hashtags ${r.hashtag_use}, ${r.language}; ${r.sentence_style}`);
if (card.conflicts.length) {
  console.log('\n  CONFLICTS:');
  card.conflicts.forEach((c) => console.log(`    ! ${c.issue}\n      user: ${c.user_says}\n      signal: ${c.signal_says}\n      resolved: ${c.resolution}`));
}
if (card.assumptions.length) {
  console.log('\n  Assumptions to check:');
  card.assumptions.forEach((a) => console.log(`    ? ${a}`));
}

if (result.cardWarnings.length) {
  console.log('\n  CARD WARNINGS:');
  result.cardWarnings.forEach((w) => console.log(`    ! ${w}`));
}
hr();
console.log(`RESEARCH: ${research.status}${research.reason ? ` (${research.reason})` : ''}`);
research.sources.slice(0, 6).forEach((s) => console.log(`  - ${s.title}\n    ${s.url}`));

hr();
console.log(`TWEETS (objective: ${plan.objectiveKey})`);
hr();
for (const t of tweets) {
  const c = checks.perTweet.find((p) => p.slot === t.slot);
  const flags = [t.revised ? `REVISED: ${t.revisionReason}` : '', ...c.issues.map((i) => `ISSUE: ${i.message}`)].filter(Boolean);
  console.log(`\n${t.slot}. [${t.style} | ${t.angle} | theme: ${t.theme || '-'}] (${c.length} chars)`);
  console.log(`   ${t.text}`);
  console.log(`   why: ${t.why}`);
  flags.forEach((f) => console.log(`   ${f}`));
}

hr();
const s = checks.summary;
console.log(`CHECKS: ${s.passed}/${s.total} passed, mix matches plan: ${s.mixMatches}`);
console.log(`First pass before critic: ${result.firstPassChecks.passed}/${result.firstPassChecks.total} passed`);
for (const f of result.firstPassIssues) console.log(`  first-pass slot ${f.slot}: ${f.issues.map((i) => `${i.code} (${i.message})`).join('; ')}`);
hr();
console.log(`REJECTED CRITIC REVISIONS: ${result.rejectedRevisions.length}`);
for (const x of result.rejectedRevisions) {
  console.log(`\n  slot ${x.slot} (critic reason: ${x.reason})`);
  console.log(`    original: ${x.originalText}   [checks: ${x.originalChecks.join('; ') || 'passed'}]`);
  console.log(`    rejected: ${x.rejectedText}`);
  console.log(`    failed:   ${x.failedChecks.join('; ')}`);
}
hr();
console.log('USAGE');
usage.calls.forEach((c) =>
  console.log(`  ${c.step.padEnd(9)} ${c.model.padEnd(16)} in ${String(c.inputTokens).padStart(6)}  out ${String(c.outputTokens).padStart(5)} (reasoning ${c.reasoningTokens})  searches ${c.searches}  ${(c.ms / 1000).toFixed(1)}s`)
);
console.log(`  TOTAL: ${usage.inputTokens} in, ${usage.outputTokens} out, ${usage.searches} searches, ${(usage.ms / 1000).toFixed(1)}s`);
console.log(`  ESTIMATED COST: $${usage.usd} (check your dashboard for the real number)`);
hr();

await mkdir(new URL('../outputs/', import.meta.url), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const fileName = `${key}-${modelLabel}-${stamp}.json`;
await writeFile(new URL(`../outputs/${fileName}`, import.meta.url), JSON.stringify(result, null, 2));
console.log(`Saved: outputs/${fileName}\n`);
