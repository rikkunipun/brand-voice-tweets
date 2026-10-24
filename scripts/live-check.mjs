// !!! THIS SCRIPT MAKES PAID OPENAI CALLS against whatever APP_URL points at: one full run (research, Voice Card, 10 !!!
// !!! tweets) plus one regenerate. Run it once, on purpose. Loading the page and the sample (steps 1-2) are free.   !!!
//
// One timed pass through a LIVE deployment, driven by headless Chrome:
//   1. load the page, 2. load the saved sample (free), 3. start over and do ONE real run with the Zomato example
//   (research + Voice Card + 10 tweets), 4. regenerate one tweet.
// It records step timings, whether progress streams (UI step changes mid-request plus per-chunk arrival times from the
// network layer), browser console errors, failed requests, and the usage the API returns (the same numbers the server logs).
// Usage: APP_URL=https://your-app.vercel.app node scripts/live-check.mjs
import puppeteer from 'puppeteer-core';
import { mkdir, writeFile } from 'node:fs/promises';

const url = (process.env.APP_URL || '').replace(/\/$/, '');
if (!url) {
  console.error('Set APP_URL');
  process.exit(1);
}
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dir = new URL('../outputs/screenshots/', import.meta.url).pathname;
await mkdir(dir, { recursive: true });

const t0 = Date.now();
const secs = (t = Date.now()) => (t - t0) / 1000;
const log = (m) => console.log(`${secs().toFixed(1).padStart(6)}s  ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

// ---- observers -------------------------------------------------------------------------------------------------
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && problems.push(`console.${m.type()}: ${m.text()}`));
page.on('requestfailed', (r) => problems.push(`requestfailed: ${r.method()} ${r.url()} ${r.failure()?.errorText}`));

const api = {}; // path -> { start, status, headers, chunks: [{t, bytes}], end, body }
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
const idToPath = new Map();
cdp.on('Network.requestWillBeSent', (e) => {
  const p = new URL(e.request.url).pathname;
  if (p.startsWith('/api/')) {
    idToPath.set(e.requestId, p);
    api[p] = { start: Date.now(), chunks: [] };
  }
});
cdp.on('Network.responseReceived', (e) => {
  const p = idToPath.get(e.requestId);
  if (!p) return;
  api[p].headersAt = Date.now();
  api[p].status = e.response.status;
  api[p].vercelId = e.response.headers['x-vercel-id'];
  api[p].contentType = e.response.headers['content-type'];
});
cdp.on('Network.dataReceived', (e) => {
  const p = idToPath.get(e.requestId);
  if (p) api[p].chunks.push({ t: Date.now(), bytes: e.dataLength });
});
cdp.on('Network.loadingFinished', async (e) => {
  const p = idToPath.get(e.requestId);
  if (!p) return;
  api[p].end = Date.now();
  try {
    api[p].body = (await cdp.send('Network.getResponseBody', { requestId: e.requestId })).body;
  } catch {}
});
page.on('response', (r) => {
  if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`);
});

// ---- helpers ----------------------------------------------------------------------------------------------------
const bodyHas = (text) => page.evaluate((t) => document.body.innerText.includes(t), text);
async function click(text, scope = 'document') {
  const ok = await page.evaluate((t, s) => {
    const root = s === 'document' ? document : document.querySelector(s);
    const el = [...root.querySelectorAll('button, a')].find((e) => e.innerText.trim().startsWith(t) && !e.disabled);
    if (el) el.click();
    return Boolean(el);
  }, text, scope);
  if (!ok) throw new Error(`Nothing clickable starting with "${text}"`);
}
const progressState = () =>
  page.evaluate(() => {
    const items = [...document.querySelectorAll('[role="status"] li')];
    const active = items.find((l) => l.querySelector('svg.animate-spin'));
    return { active: active ? active.innerText.split('\n')[0].trim() : null, done: items.filter((l) => l.querySelector('svg.text-emerald-600')).length, total: items.length };
  });
const shot = (name) => page.screenshot({ path: `${dir}live-${name}.png`, fullPage: true });

// Waits for text to appear, logging every change of the active progress step with its timestamp.
async function watch(doneText, timeoutMs, label) {
  const start = Date.now();
  const stepTimes = [];
  let last = '';
  while (Date.now() - start < timeoutMs) {
    if (await bodyHas(doneText)) {
      const total = (Date.now() - start) / 1000;
      log(`${label}: done in ${total.toFixed(1)}s`);
      return { total, stepTimes };
    }
    const ps = await progressState();
    const key = ps.active ? `${ps.done}/${ps.total} ${ps.active}` : '';
    if (key && key !== last) {
      last = key;
      stepTimes.push({ at: (Date.now() - start) / 1000, step: ps.active, done: ps.done });
      log(`${label}: now on "${ps.active}" (${ps.done} of ${ps.total} done)  [+${((Date.now() - start) / 1000).toFixed(1)}s]`);
    }
    const err = await page.evaluate(() => document.querySelector('[role="alert"]')?.innerText || '');
    if (err) throw new Error(`${label} failed in the UI: ${err.replace(/\s+/g, ' ')}`);
    await sleep(250);
  }
  throw new Error(`${label}: timed out after ${timeoutMs / 1000}s`);
}

const timings = {};
let failure = null;
try {
  // 1. page load
  let t = Date.now();
  await page.goto(url, { waitUntil: 'networkidle0' });
  timings.pageLoad = (Date.now() - t) / 1000;
  log(`page load (networkidle): ${timings.pageLoad.toFixed(2)}s`);

  // 2. sample (free)
  t = Date.now();
  await click('Zomato (with real posts)');
  await watch('Your 10 tweets', 30000, 'sample');
  timings.sample = (Date.now() - t) / 1000;
  await shot('1-sample-tweets');

  // 3. one real run, from scratch
  await click('Start over');
  await click('Try an example: Zomato');
  const inputsOk = await page.evaluate(() => document.querySelector('#brandName').value === 'Zomato' && document.querySelector('#pastPosts').value.split('\n').length === 6);
  log(`form prefilled with the Zomato example (brand + 6 posts): ${inputsOk}`);
  await shot('2-form');

  log('--- REAL RUN: analyze ---');
  t = Date.now();
  await click('Build Voice Card');
  const analyze = await watch('Generate 10 tweets', 290000, 'analyze');
  timings.analyze = (Date.now() - t) / 1000;
  timings.analyzeSteps = analyze.stepTimes;
  await shot('3-voice');

  log('--- REAL RUN: generate ---');
  t = Date.now();
  await click('Generate 10 tweets');
  const generate = await watch('Your 10 tweets', 290000, 'generate');
  timings.generate = (Date.now() - t) / 1000;
  timings.generateSteps = generate.stepTimes;
  const summary = await page.evaluate(() => ({
    checks: document.body.innerText.match(/(\d+)\/(\d+) passed the automated checks[^\n]*/)?.[0] || '',
    tweets: [...document.querySelectorAll('article')].map((a) => a.querySelector('p.whitespace-pre-wrap').innerText),
  }));
  log(`result: ${summary.checks}; ${summary.tweets.length} tweets`);
  await shot('4-tweets');

  // 4. regenerate one tweet
  log('--- REAL RUN: regenerate tweet 4 ---');
  const before = summary.tweets[3];
  t = Date.now();
  await page.evaluate(() => {
    const card = document.querySelector('article[aria-label="Tweet 4"]');
    [...card.querySelectorAll('button')].find((b) => b.innerText.startsWith('Regenerate')).click();
  });
  await page.waitForFunction(() => document.querySelector('article[aria-label="Tweet 4"]')?.innerText.includes('Regenerated'), { timeout: 120000 });
  timings.regenerate = (Date.now() - t) / 1000;
  const after = await page.evaluate(() => document.querySelector('article[aria-label="Tweet 4"] p.whitespace-pre-wrap').innerText);
  log(`regenerate: done in ${timings.regenerate.toFixed(1)}s`);
  log(`  before: ${before}`);
  log(`  after:  ${after}`);
  await shot('5-after-regenerate');
} catch (err) {
  failure = err.message;
  log(`STOPPED: ${err.message}`);
  await shot('stopped').catch(() => {});
}

await sleep(1500); // let the last response bodies finish arriving

// ---- report -----------------------------------------------------------------------------------------------------
console.log('\n==== API CALLS (from the browser network layer) ====');
const report = {};
for (const [p, c] of Object.entries(api)) {
  const rel = (x) => (x ? ((x - c.start) / 1000).toFixed(1) : '?');
  const sizes = c.chunks.map((k) => `+${rel(k.t)}s/${k.bytes}B`);
  const events = [];
  let usage = null;
  for (const line of (c.body || '').split('\n').filter(Boolean)) {
    try {
      const ev = JSON.parse(line);
      if (ev.type === 'progress') events.push(ev.step);
      if (ev.usage) usage = ev.usage;
    } catch {
      try { usage = JSON.parse(c.body).usage; } catch {}
    }
  }
  if (!usage && c.body) { try { usage = JSON.parse(c.body).usage; } catch {} }
  report[p] = { status: c.status, vercelId: c.vercelId, contentType: c.contentType, headersAfterS: rel(c.headersAt), totalS: rel(c.end), chunks: c.chunks.length, chunkArrival: sizes, progressEvents: events, usage };
  console.log(`${p}: status ${c.status}, headers after ${rel(c.headersAt)}s, finished after ${rel(c.end)}s, ${c.chunks.length} chunks, region/id ${c.vercelId}`);
  console.log(`   content-type: ${c.contentType}`);
  console.log(`   chunk arrival: ${sizes.join('  ')}`);
  if (events.length) console.log(`   progress events: ${events.join(' -> ')}`);
  console.log(`   usage: ${JSON.stringify(usage)}`);
}
console.log('\n==== BROWSER CONSOLE / NETWORK PROBLEMS ====');
console.log(problems.length ? problems.join('\n') : 'none');
console.log('\n==== TIMINGS (s) ====');
console.log(JSON.stringify({ ...timings, failure }, null, 2));
await writeFile(new URL('../outputs/live-check.json', import.meta.url), JSON.stringify({ timings, api: report, problems, failure }, null, 2));
await browser.close();
