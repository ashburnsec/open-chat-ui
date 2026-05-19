'use client';

/**
 * Client-safe pricing cache for the chat-bubble cost badges (M24).
 *
 * One module-level Map per browser tab. We fetch `/api/pricing` once
 * (via the generic BFF proxy), keep it hot for an hour, and let every
 * `<UsageBadge>` look up its model synchronously. Re-fetching is opt-in
 * via `ensurePricingLoaded()` — typically called once at chat shell
 * mount.
 *
 * The `quota_type === 1` (per-call) rows are intentionally treated as
 * "no per-token rate available": their `model_ratio` is meaningless,
 * and we have no easy place to surface a "$0.05/call" badge yet.
 * Returning null lets the badge fall back to token-only display, which
 * is correct (we still know how many tokens went up — we just don't
 * know how to convert them to USD without misleading the user).
 */

type PricingRow = {
  model_name: string;
  /** 0 = per-token (use model_ratio + completion_ratio); 1 = per-call. */
  quota_type: number;
  /** Input ratio. USD/M tokens at 1× = `model_ratio × 2`. */
  model_ratio: number;
  /** Output / input ratio. */
  completion_ratio: number;
  /** Per-call price in USD. Only meaningful when quota_type === 1. */
  model_price: number;
};

const PRICE_USD_PER_M_AT_1X = 2;
const TTL_MS = 60 * 60 * 1000; // 1 hour

const cache = new Map<string, PricingRow>();
let loadedAt = 0;
let inFlight: Promise<void> | null = null;

/** Subscribers fire whenever the cache is freshly populated, so React
 *  components can re-render once data shows up. Used by
 *  `usePricingVersion()` below. */
const subscribers = new Set<() => void>();
let version = 0;

/** Fetch the catalog into the module-level Map. Cheap to call: returns
 *  immediately when fresh, dedupes concurrent calls into one request,
 *  and swallows network failures (badges fall back to token-only).
 *  Safe to await from multiple components — the underlying fetch only
 *  runs once per TTL window. */
export async function ensurePricingLoaded(): Promise<void> {
  if (cache.size > 0 && Date.now() - loadedAt < TTL_MS) return;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const r = await fetch('/api/newapi/api/pricing', { cache: 'no-store' });
      const j = await r.json();
      const list: PricingRow[] | undefined = j?.data;
      if (!Array.isArray(list)) return;
      cache.clear();
      for (const row of list) {
        if (row && typeof row.model_name === 'string') cache.set(row.model_name, row);
      }
      loadedAt = Date.now();
      version++;
      for (const cb of subscribers) cb();
    } catch {
      /* swallow — badges render token-only */
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Synchronous cost lookup. Returns null when the model isn't priced
 *  (cache miss, never loaded, per-call billing). Callers should treat
 *  null as "render token count only" — never estimate. */
export function getCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number | null {
  if (!model) return null;
  const row = cache.get(model);
  if (!row) return null;
  if (row.quota_type === 1) return null;
  if (!Number.isFinite(row.model_ratio) || row.model_ratio <= 0) return null;
  const inUsd = (promptTokens * row.model_ratio * PRICE_USD_PER_M_AT_1X) / 1_000_000;
  const outUsd =
    (completionTokens * row.model_ratio * row.completion_ratio * PRICE_USD_PER_M_AT_1X) /
    1_000_000;
  return inUsd + outUsd;
}

/** Subscribe to cache reloads. Returns an unsubscribe fn. */
export function subscribePricing(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** Internal accessor used by `usePricingVersion()` — bumps every time
 *  the cache repopulates, so React re-renders downstream. */
export function getPricingVersion(): number {
  return version;
}
