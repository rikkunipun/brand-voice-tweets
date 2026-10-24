// In-memory rate limiting and research cache.
// LIMITS: a serverless host can run several instances and recycles them, and each has its own memory. So these
// limits are per-instance and reset on a cold start. They stop casual abuse and accidental loops, not a determined
// attacker. For a hard limit, move both to a shared store (for example Redis).

const HOUR = 60 * 60 * 1000;

export const LIMITS = {
  analyze: { max: 5, windowMs: HOUR },
  generate: { max: 10, windowMs: HOUR },
  regenerate: { max: 30, windowMs: HOUR },
};

const hitsByKey = new Map(); // "action:ip" -> timestamps (ms)
const MAX_KEYS = 5000;

export function rateLimit(action, ip, now = Date.now()) {
  const { max, windowMs } = LIMITS[action];
  const key = `${action}:${ip}`;
  const hits = (hitsByKey.get(key) || []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    hitsByKey.set(key, hits);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)) };
  }
  hits.push(now);
  hitsByKey.set(key, hits);
  if (hitsByKey.size > MAX_KEYS) {
    for (const [k, v] of hitsByKey) if (!v.length || now - v[v.length - 1] >= windowMs) hitsByKey.delete(k);
  }
  return { ok: true, remaining: max - hits.length };
}

export function rateLimitMessage(action, retryAfterSec) {
  const mins = Math.max(1, Math.ceil(retryAfterSec / 60));
  const what = action === 'analyze' ? 'voice analyses' : action === 'generate' ? 'tweet sets' : 'tweet regenerations';
  return `You've reached the limit of ${LIMITS[action].max} ${what} per hour. Please try again in about ${mins} minute${mins === 1 ? '' : 's'}. (This limit keeps the demo's API costs under control.)`;
}

// Research is the slow, expensive step, and it only depends on the brand, so it is cached for 24 hours.
const RESEARCH_TTL_MS = 24 * HOUR;
const MAX_CACHED_BRANDS = 200;
const researchCache = new Map(); // lowercase brand name + industry -> { at, research }

// Industry is part of the key: the same name can be a different brand (or search) in another category.
const cacheKey = (brandName, industry = '') => `${brandName.trim().toLowerCase()}|${industry.trim().toLowerCase()}`;

export function getCachedResearch(brandName, industry = '', now = Date.now()) {
  if (!brandName?.trim()) return null;
  const hit = researchCache.get(cacheKey(brandName, industry));
  if (!hit) return null;
  if (now - hit.at > RESEARCH_TTL_MS) {
    researchCache.delete(cacheKey(brandName, industry));
    return null;
  }
  return hit.research;
}

// Only successful research is cached, so a failed search is retried next time.
export function setCachedResearch(brandName, industry, research, now = Date.now()) {
  if (!brandName?.trim() || research?.status !== 'found') return;
  researchCache.set(cacheKey(brandName, industry), { at: now, research });
  if (researchCache.size > MAX_CACHED_BRANDS) researchCache.delete(researchCache.keys().next().value);
}

export function resetLimitsForTests() {
  hitsByKey.clear();
  researchCache.clear();
}
