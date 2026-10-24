// Drives the running app (npm run dev) in headless Chrome and saves screenshots to outputs/screenshots/.
// Usage: node scripts/screenshots.mjs sample   -> loads the saved sample (free)
//        node scripts/screenshots.mjs e2e      -> a REAL run through the UI (paid: research + 3 model calls + 1 regenerate)
// Env: APP_URL (default http://localhost:3000), CHROME_PATH
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const mode = process.argv[2] || 'sample';
const url = process.env.APP_URL || 'http://localhost:3000';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const dir = new URL('../outputs/screenshots/', import.meta.url).pathname;
await mkdir(dir, { recursive: true });

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));

const tag = process.env.SHOT_TAG || ''; // e.g. -v2
const shot = async (name, fullPage = true) => {
  // Hide Next's dev-only indicator. For full-page captures, un-stick the bottom bar (a tall capture would draw it
  // mid-page); the viewport-only shots show the real sticky behaviour.
  await page.addStyleTag({ content: 'nextjs-portal{display:none !important}' });
  if (fullPage) await page.evaluate(() => document.querySelectorAll('.sticky').forEach((e) => (e.style.position = 'static')));
  await page.screenshot({ path: `${dir}${mode}-${name}${tag}.png`, fullPage });
  if (fullPage) await page.evaluate(() => document.querySelectorAll('.sticky').forEach((e) => (e.style.position = '')));
  console.log(`saved ${mode}-${name}${tag}.png`);
};
const hasText = (text, timeout = 30000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
const click = async (text, tag = 'button') => {
  const ok = await page.evaluate((t, tg) => {
    const el = [...document.querySelectorAll(tg)].find((e) => e.innerText.trim().startsWith(t) && !e.disabled);
    if (el) el.click();
    return Boolean(el);
  }, text, tag);
  if (!ok) throw new Error(`No enabled <${tag}> starting with "${text}"`);
};

async function run(viewport, suffix) {
  await page.setViewport(viewport);
  await page.goto(url, { waitUntil: 'networkidle0' });
  if (mode === 'sample') {
    await shot(`1-details${suffix}`);
    await click('Zomato (with real posts)');
    await hasText('Your 10 tweets');
    await click('Revised by editor');
    await shot(`3-tweets${suffix}`);
    // What "Copy all" puts on the clipboard (stubbed so the headless browser doesn't need permission).
    await page.evaluate(() => { window.__copied = ''; navigator.clipboard.writeText = async (t) => { window.__copied = t; }; });
    await click('Copy all');
    await new Promise((r) => setTimeout(r, 200));
    if (!suffix) console.log(`--- COPY ALL TEXT ---\n${await page.evaluate(() => window.__copied)}\n--- END ---`);
    await click('Back to Voice');
    await hasText('How we know');
    await shot(`2-voice${suffix}`);
    // Viewport-only shot partway down, to show the sticky "Generate 10 tweets" bar.
    await page.evaluate(() => window.scrollTo(0, 500));
    await shot(`2b-voice-sticky-bar${suffix}`, false);
    // Open every collapsed section to check that nothing is cut off.
    await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
    await new Promise((r) => setTimeout(r, 300));
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(`2c-voice-all-open${suffix}`);
    const clipped = await page.evaluate(() => [...document.querySelectorAll('textarea')].filter((t) => t.scrollHeight > t.clientHeight + 1).map((t) => t.id || t.getAttribute('aria-label')));
    console.log(`clipped textareas${suffix}: ${clipped.length ? clipped.join(', ') : 'none'}`);
    const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    console.log(`horizontal overflow${suffix}: ${overflowX}`);
  } else {
    await click('Try an example: Zomato');
    await shot(`1-form${suffix}`);
    await click('Build Voice Card');
    await hasText('Working on it');
    await new Promise((r) => setTimeout(r, 4000));
    await shot(`1b-progress${suffix}`);
    await hasText('Generate 10 tweets', 240000);
    await shot(`2-voicecard${suffix}`);
    await click('Generate 10 tweets');
    await hasText('Working on it');
    await hasText('Your 10 tweets', 240000);
    const revised = await page.evaluate(() => {
      const el = [...document.querySelectorAll('button')].find((e) => e.innerText.startsWith('Revised by editor'));
      if (el) el.click();
      return Boolean(el);
    });
    console.log(`revised tag present: ${revised}`);
    await shot(`3-tweets${suffix}`);
    // Regenerate tweet 4 and wait for it to finish.
    await page.evaluate(() => {
      const card = document.querySelector('article[aria-label="Tweet 4"]');
      [...card.querySelectorAll('button')].find((b) => b.innerText.startsWith('Regenerate')).click();
    });
    await page.waitForFunction(() => document.querySelector('article[aria-label="Tweet 4"]')?.innerText.includes('Regenerated'), { timeout: 120000 });
    const tweet4 = await page.evaluate(() => document.querySelector('article[aria-label="Tweet 4"] p.whitespace-pre-wrap').innerText);
    console.log(`tweet 4 after regenerate: ${tweet4}`);
    await shot(`4-after-regenerate${suffix}`);
  }
}

try {
  await run({ width: 1280, height: 900 }, '');
  if (mode === 'sample') await run({ width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 }, '-mobile');
} finally {
  console.log(errors.length ? `PAGE ERRORS:\n${errors.join('\n')}` : 'no page errors');
  await browser.close();
}
