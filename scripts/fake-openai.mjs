// A tiny fake of OpenAI's POST /v1/responses that returns canned results, so the whole app can be exercised
// end to end (UI, streaming, regenerate) with no API key and no cost.
// Usage: node scripts/fake-openai.mjs [port]      then run the app with:
//        OPENAI_BASE_URL=http://localhost:4010 OPENAI_API_KEY=fake npm run dev
// The answers come from public/samples/millet.json, so they are shaped like real pipeline output, with realistic delays.
import http from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.argv[2] || 4010);
const sample = JSON.parse(await readFile(new URL('../public/samples/millet.json', import.meta.url), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const message = (text) => ({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text, annotations: [] }] });
const answer = (name, hasTools) => {
  if (hasTools) return { text: 'OBSERVED\n- Short captions (brand-owned: @fake)\n\nEXAMPLE PHRASES\n- none\n\nREPORTED\n- none\n\nGAPS\n- fake research for tests', searches: 2, delay: 1500 };
  if (name === 'voice_card') return { text: JSON.stringify(sample.card), delay: 800 };
  if (name === 'tweets') return { text: JSON.stringify({ tweets: sample.tweets.map((t) => ({ slot: t.slot, style: t.style, text: t.text, why: t.why || 'fake' })) }), delay: 800 };
  if (name === 'critic') return { text: JSON.stringify({ reviews: [] }), delay: 600 };
  return { text: '{}', delay: 100 };
};

http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  const json = body ? JSON.parse(body) : {};
  const a = answer(json.text?.format?.name, Boolean(json.tools?.length));
  await sleep(a.delay);
  const output = [...Array.from({ length: a.searches || 0 }, () => ({ type: 'web_search_call', status: 'completed' })), message(a.text)];
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ id: 'resp_fake', object: 'response', status: 'completed', model: json.model, output, usage: { input_tokens: 1000, output_tokens: 300, output_tokens_details: { reasoning_tokens: 50 } } }));
}).listen(port, () => console.log(`fake OpenAI listening on :${port}`));
