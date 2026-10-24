// Renders app/icon.svg to app/favicon.ico (16, 32 and 48 px, PNG-encoded) using headless Chrome.
// Usage: node scripts/make-favicon.mjs
import puppeteer from 'puppeteer-core';
import { readFile, writeFile } from 'node:fs/promises';

const svg = await readFile(new URL('../app/icon.svg', import.meta.url), 'utf8');
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sizes = [16, 32, 48];

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const pngs = [];
for (const size of sizes) {
  await page.setViewport({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  pngs.push(await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
}
await browser.close();

// ICO container: 6-byte header, one 16-byte directory entry per image, then the PNG data.
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = sizes.map((size, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size, 0); // width
  e.writeUInt8(size, 1); // height
  e.writeUInt16LE(1, 4); // colour planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
await writeFile(new URL('../app/favicon.ico', import.meta.url), Buffer.concat([header, ...entries, ...pngs]));
console.log(`Wrote app/favicon.ico (${sizes.join(', ')} px)`);
