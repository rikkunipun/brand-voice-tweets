import OpenAI from 'openai';
import { getConfig } from './config.js';

let _client;
export function getClient() {
  // Reads OPENAI_API_KEY from the environment. The timeout keeps one stuck call (usually web search) from using
  // up a serverless function's whole duration; research failures are non-fatal, so the run continues without it.
  if (!_client) _client = new OpenAI({ timeout: 90_000, maxRetries: 1 });
  return _client;
}

// A meter records every model call so we can see tokens, searches and estimated cost per run.
export function createMeter() {
  return { calls: [] };
}

export function estimateCost(meter) {
  const { pricing } = getConfig();
  let input = 0, output = 0, searches = 0, usd = 0;
  for (const c of meter.calls) {
    input += c.inputTokens;
    output += c.outputTokens;
    searches += c.searches;
    const p = pricing.models[c.model] || pricing;
    usd += (c.inputTokens / 1e6) * p.inputPerM + (c.outputTokens / 1e6) * p.outputPerM + c.searches * pricing.perSearch;
  }
  return { inputTokens: input, outputTokens: output, searches, usd: Math.round(usd * 10000) / 10000 };
}

export async function callModel({ step, model, instructions, input, schema, schemaName, tools, meter, client }) {
  const cfg = getConfig();
  const params = { model, instructions, input };
  if (tools?.length) params.tools = tools;
  if (schema) {
    params.text = { format: { type: 'json_schema', name: schemaName, schema, strict: true } };
  }
  if (cfg.reasoningEffort !== 'none') params.reasoning = { effort: cfg.reasoningEffort };

  const started = Date.now();
  const res = await (client || getClient()).responses.create(params);
  const searches = (res.output || []).filter((o) => o.type === 'web_search_call').length;

  meter?.calls.push({
    step,
    model,
    inputTokens: res.usage?.input_tokens ?? 0,
    outputTokens: res.usage?.output_tokens ?? 0,
    reasoningTokens: res.usage?.output_tokens_details?.reasoning_tokens ?? 0,
    searches,
    ms: Date.now() - started,
  });

  if (res.status && res.status !== 'completed') {
    throw new Error(`${step}: response ${res.status} (${res.incomplete_details?.reason || 'no reason given'})`);
  }
  return res;
}

export function parseJson(res, step) {
  try {
    return JSON.parse(res.output_text);
  } catch {
    throw new Error(`${step}: model did not return valid JSON`);
  }
}

// Pull url_citation annotations out of a web-search response, de-duplicated by URL.
export function extractCitations(res) {
  const seen = new Map();
  for (const item of res.output || []) {
    if (item.type !== 'message') continue;
    for (const part of item.content || []) {
      for (const a of part.annotations || []) {
        if (a.type === 'url_citation' && a.url && !seen.has(a.url)) {
          seen.set(a.url, { url: a.url, title: a.title || a.url });
        }
      }
    }
  }
  return [...seen.values()];
}
