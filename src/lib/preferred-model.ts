/**
 * Resolve a sensible model name to use when the caller hasn't explicitly
 * picked one. Two-tier fallback:
 *
 *   1. `cp:last-model` from localStorage — set by ChatPanel whenever the
 *      user actively picks a model from the picker. This is the "what
 *      the user is currently using" signal.
 *
 *   2. First entry of `/api/user/models` — what new-api says the user's
 *      group is allowed to use.
 *
 * Returns null only if the user has access to zero models (in which case
 * the caller should surface a sensible error). Falls back to network on
 * a cold cache, so callers should `await` it inside an async path.
 */

const LAST_MODEL_KEY = 'cp:last-model';

export async function getPreferredModel(): Promise<string | null> {
  if (typeof window !== 'undefined') {
    const cached = window.localStorage.getItem(LAST_MODEL_KEY);
    if (cached) return cached;
  }
  try {
    const r = await fetch('/api/newapi/api/user/models', { cache: 'no-store' });
    const j = await r.json();
    if (j?.success && Array.isArray(j.data) && j.data.length > 0) {
      // The /models endpoint returns string[] of model names.
      return String(j.data[0]);
    }
  } catch {
    /* fall through */
  }
  return null;
}
