// Client helpers for talking to the API routes.

const GENERIC = 'Something went wrong. Please try again.';

async function failureMessage(res) {
  const data = await res.json().catch(() => ({}));
  return data.error || GENERIC;
}

// POST that streams newline-delimited JSON events. Calls onEvent for each event and returns the final result.
export async function streamPost(url, body, onEvent) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  if (!res.ok || !(res.headers.get('content-type') || '').includes('ndjson')) throw new Error(await failureMessage(res));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;
  const handle = (line) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'error') throw new Error(event.message || GENERIC);
    if (event.type === 'result') result = event;
    else onEvent?.(event);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    lines.forEach(handle);
  }
  handle(buffer);
  if (!result) throw new Error('The connection closed before the result arrived. Please try again.');
  return result;
}

export async function postJson(url, body) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  if (!res.ok) throw new Error(await failureMessage(res));
  return res.json();
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {}
    ta.remove();
    return ok;
  }
}

// "meme or parody format that fits the voice: a fake equation, ..." -> "meme or parody format that fits the voice"
export function shortAngle(angle = '') {
  return angle.split(/\s*(?::|\(| such as )/)[0].trim();
}

export function cleanUrl(url) {
  try {
    const u = new URL(url);
    u.searchParams.delete('utm_source');
    return u.toString();
  } catch {
    return url;
  }
}
