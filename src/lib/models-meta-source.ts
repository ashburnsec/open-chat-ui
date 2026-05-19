/**
 * M32-2.B-1 · Source for newapi-provided per-model metadata.
 *
 * newapi's `models` table stores admin-editable display fields
 * (description, icon, tags, vendor) keyed by model_name. The user-level
 * endpoint `/api/user/model_meta` (added by [chat-portal] patch in
 * vendor/new-api/) returns rows the current user can access.
 *
 * For now this is shipped as plumbing only — once admin starts seeding
 * the metadata table, B-3 will wire it into findModelEntry so newapi
 * description/icon overrides the hardcoded catalog. Until then the
 * fetched cache stays unused but available for inspection.
 */

export type NewapiModelMeta = {
  model_name: string;
  description?: string;
  icon?: string;
  tags?: string;
  vendor_id?: number;
  vendor_name?: string;
  endpoints?: string;
};

const TTL_MS = 5 * 60_000;

let cache: ReadonlyMap<string, NewapiModelMeta> | null = null;
let inflight: Promise<ReadonlyMap<string, NewapiModelMeta>> | null = null;
let cachedAt = 0;

async function doFetch(): Promise<ReadonlyMap<string, NewapiModelMeta>> {
  try {
    const res = await fetch('/api/newapi/api/user/model_meta', {
      credentials: 'include',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) return new Map();
    const body = (await res.json()) as { success?: boolean; data?: unknown };
    if (!body.success || !Array.isArray(body.data)) return new Map();
    const entries: Array<[string, NewapiModelMeta]> = [];
    for (const item of body.data as NewapiModelMeta[]) {
      if (item && typeof item.model_name === 'string' && item.model_name) {
        entries.push([item.model_name, item]);
      }
    }
    return new Map(entries);
  } catch {
    return new Map();
  }
}

/**
 * Lazily fetch and cache the user's accessible model metadata.
 * Multiple concurrent callers share one in-flight request. Cache lives
 * for 5 min; pass `force: true` to bypass.
 */
export async function loadUserModelMeta(force = false): Promise<ReadonlyMap<string, NewapiModelMeta>> {
  if (typeof window === 'undefined') return new Map();
  const fresh = cache != null && Date.now() - cachedAt < TTL_MS;
  if (!force && fresh) return cache!;
  if (inflight) return inflight;
  inflight = doFetch().then((m) => {
    cache = m;
    cachedAt = Date.now();
    inflight = null;
    return m;
  });
  return inflight;
}

/**
 * Synchronous read of the cache. Returns null if not yet warmed.
 * Callers should tolerate missing data and fall back to hardcoded
 * metadata.
 */
export function peekUserModelMeta(): ReadonlyMap<string, NewapiModelMeta> | null {
  return cache;
}
