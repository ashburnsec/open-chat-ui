import { newapi } from './newapi';
import { cookies } from 'next/headers';

/**
 * Some upstream relay endpoints (`/v1/images/*`, `/v1/audio/*`, ...) only
 * accept API-token auth — session cookies are rejected. To keep the
 * chat-portal UX cookie-only from the user's perspective, we transparently
 * lazy-mint an API token per user on first need:
 *
 *   1. List the user's tokens; if one named TOKEN_NAME exists, use it.
 *   2. Otherwise create it (unlimited quota, never expires, default group).
 *   3. POST /api/token/:id/key to reveal the plaintext key.
 *   4. Cache in-memory keyed by user id so subsequent image calls don't
 *      hit the upstream rate-limited /key endpoint.
 *
 * Cache scope is the Next dev/SSR worker process. On restart we re-mint
 * via the existing token row; CriticalRateLimit (20/20min/IP) is the only
 * shared budget at risk, and one call per user per process restart is fine.
 *
 * Future M4: persist the cache in conv-svc's postgres so prod deploys
 * with multiple workers don't each re-mint their own.
 */

// Renamed M12-D from "chat-portal-default" → "webchat" to be friendlier
// if it ever leaks through usage logs. We match either name when looking
// up an existing token so users who minted under the old name keep
// using the same key instead of getting a duplicate.
const TOKEN_NAME = 'webchat';
const LEGACY_TOKEN_NAMES: readonly string[] = ['chat-portal-default'];
/** Resolved keys, keyed by uid. Cleared on logout via clearUserApiTokenCache. */
const cache = new Map<number, string>();
/**
 * In-flight mints, keyed by uid. M18-H2: without this, two concurrent
 * /api/image/* requests both find an empty cache, both run the full
 * 3-step mint flow, and both create a duplicate "webchat" row in
 * new-api. Resolving via a shared Promise collapses N concurrent calls
 * into a single mint round-trip.
 */
const inFlight = new Map<number, Promise<string>>();

type TokenRow = { id: number; name: string; status: number };

export async function getOrCreateUserApiToken(): Promise<string> {
  const store = await cookies();
  const uidStr = store.get('uid')?.value;
  if (!uidStr) throw new Error('no uid cookie');
  const uid = Number(uidStr);
  const cached = cache.get(uid);
  if (cached) return cached;
  const pending = inFlight.get(uid);
  if (pending) return pending;
  const promise = mintInternal(uid).finally(() => {
    inFlight.delete(uid);
  });
  inFlight.set(uid, promise);
  return promise;
}

async function mintInternal(uid: number): Promise<string> {
  // Step 1 — find existing.
  const list = await newapi<{ items?: TokenRow[] } | TokenRow[]>(
    '/api/token/?p=0&size=50',
  );
  const items = Array.isArray(list.data) ? list.data : list.data?.items ?? [];
  // Reuse legacy-named row if it exists so old users don't get a dup.
  const matchNames: readonly string[] = [TOKEN_NAME, ...LEGACY_TOKEN_NAMES];
  let row = items.find((t) => matchNames.includes(t.name) && t.status === 1);

  // Step 2 — create if missing.
  if (!row) {
    const created = await newapi('/api/token/', {
      method: 'POST',
      body: JSON.stringify({
        name: TOKEN_NAME,
        unlimited_quota: true,
        remain_quota: 0,
        expired_time: -1,
        group: 'default',
        model_limits_enabled: false,
      }),
    });
    if (!created.success) {
      throw new Error(`create token failed: ${created.message ?? 'unknown'}`);
    }
    // Refetch — POST does not return the id on this version.
    const list2 = await newapi<{ items?: TokenRow[] } | TokenRow[]>(
      '/api/token/?p=0&size=50',
    );
    const items2 = Array.isArray(list2.data) ? list2.data : list2.data?.items ?? [];
    row = items2.find((t) => t.name === TOKEN_NAME && t.status === 1);
    if (!row) throw new Error('token created but not retrievable');
  }

  // Step 3 — reveal plaintext key.
  const keyRes = await newapi<{ key: string }>(`/api/token/${row.id}/key`, {
    method: 'POST',
  });
  if (!keyRes.success || !keyRes.data?.key) {
    throw new Error(keyRes.message || 'reveal key failed');
  }

  // Step 4 — cache and return.
  cache.set(uid, keyRes.data.key);
  return keyRes.data.key;
}

/**
 * Drop a user's cached plaintext token. Called from the logout BFF route
 * so a subsequent login as a different user on the same Next.js worker
 * cannot inherit the previous user's API key from this in-memory map.
 *
 * Idempotent — safe to call when no entry exists.
 */
export function clearUserApiTokenCache(uid: number): void {
  cache.delete(uid);
  inFlight.delete(uid);
}
