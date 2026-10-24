// Small helpers shared by the API routes.
import { rateLimit, rateLimitMessage } from './limits.js';

export class UserError extends Error {}

const MAX_BODY_BYTES = 60_000;

export function getIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

export async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new UserError('That request is too large.');
  try {
    return JSON.parse(text);
  } catch {
    throw new UserError('That request could not be read.');
  }
}

export function jsonResponse(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

// Messages for people. Raw API errors never reach the browser (they are logged on the server instead).
export function friendlyError(err) {
  if (err instanceof UserError) return err.message;
  if (/^(Give at least|There is no tweet|Invalid data|The model returned an empty)/.test(err?.message || '')) return err.message;
  return 'Something went wrong while talking to the AI service. Please try again in a minute.';
}

export function failure(err, status = 400) {
  if (!(err instanceof UserError)) console.error('[api]', err?.name, err?.message);
  return jsonResponse({ error: friendlyError(err) }, status);
}

// Returns a 429 Response when the visitor is over the limit, otherwise null.
export function limited(request, action) {
  const res = rateLimit(action, getIp(request));
  if (res.ok) return null;
  return jsonResponse({ error: rateLimitMessage(action, res.retryAfterSec) }, 429, { 'Retry-After': String(res.retryAfterSec) });
}

// Streams newline-delimited JSON events so the page can show real progress during a long request.
export function ndjson(handler) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        await handler(send);
      } catch (err) {
        if (!(err instanceof UserError)) console.error('[api]', err?.name, err?.message);
        send({ type: 'error', message: friendlyError(err) });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store, no-transform' },
  });
}
