// Keeps the work in sessionStorage so a refresh doesn't lose it. Every storage call is wrapped:
// storage can be missing, full or blocked (private windows), and the page must work without it.
export const SESSION_KEY = 'brand-voice-tweets:session:v1';

export function saveSession(storage, state) {
  try {
    storage.setItem(SESSION_KEY, JSON.stringify({ v: 1, ...state }));
    return true;
  } catch {
    return false;
  }
}

// Returns the saved state, or null when there is none or it can't be trusted.
export function loadSession(storage) {
  try {
    const data = JSON.parse(storage.getItem(SESSION_KEY) || 'null');
    if (!data || data.v !== 1 || typeof data.inputs !== 'object' || !data.inputs) return null;
    if (data.card && (typeof data.card !== 'object' || !Array.isArray(data.card.voice_summary) || !Array.isArray(data.card.tone))) return null;
    if (data.tweetResult && !Array.isArray(data.tweetResult.tweets)) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSession(storage) {
  try {
    storage.removeItem(SESSION_KEY);
  } catch {}
}

export const browserStorage = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};
