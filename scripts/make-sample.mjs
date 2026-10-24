// Turns a saved pipeline run in outputs/ into a static sample for the app (no API cost to view).
// Usage: node scripts/make-sample.mjs <outputs/file.json> <name>   ->   public/samples/<name>.json
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const [file, name] = process.argv.slice(2);
if (!file || !name) {
  console.error('Usage: node scripts/make-sample.mjs <outputs/file.json> <name>');
  process.exit(1);
}
const run = JSON.parse(await readFile(file, 'utf8'));
const cleanUrl = (u) => u.replace(/[?&]utm_source=openai$/, '').replace(/\?utm_source=openai&/, '?');
const sample = {
  inputs: run.inputs,
  card: run.card,
  cardWarnings: run.cardWarnings || [],
  research: {
    status: run.research.status,
    reason: run.research.reason || '',
    sources: (run.research.sources || []).map((s) => ({ ...s, url: cleanUrl(s.url) })),
    cached: false,
  },
  plan: run.plan,
  tweets: run.tweets,
  checks: run.checks,
};
await mkdir(new URL('../public/samples/', import.meta.url), { recursive: true });
await writeFile(new URL(`../public/samples/${name}.json`, import.meta.url), JSON.stringify(sample, null, 2));
console.log(`Wrote public/samples/${name}.json (${sample.tweets.length} tweets, checks ${sample.checks.summary.passed}/${sample.checks.summary.total})`);
