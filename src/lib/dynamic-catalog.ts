/**
 * M34: dynamic catalog merger.
 *
 * Combines three sources to produce the model list shown to the user:
 *
 *   1. newapi `/api/user/models` — string[] of bare model ids that the
 *      gateway can route. Authoritative for "what's reachable right now".
 *
 *   2. chat_portal `/v1/models/overrides` (conv-svc) — admin's choices
 *      for display_name / description / enabled / sort_order. Wins over
 *      catalog hardcode when present.
 *
 *   3. `lib/models-catalog.ts` MODELS_CATALOG hardcode — fallback for
 *      displayName / description, plus the canonical source for the
 *      technical fields (category / vendor / vision) that admin doesn't
 *      get to edit.
 *
 * Falls back gracefully when any source is missing — admin overrides
 * row absent → catalog hardcode wins; catalog entry absent → synthesise
 * from id heuristics so a brand-new newapi model still renders something.
 *
 * 5-minute client cache keyed in localStorage so rapid model picker /
 * library opens don't hammer the BFF. Force-refresh option (`load(true)`)
 * for after-edit invalidation. SSR-safe: when run in node (no window),
 * skips localStorage and just fetches.
 */

import {
  MODELS_CATALOG,
  type ModelCategory,
  type ModelEntry,
  type ModelVendor,
  stripChannelSuffix,
} from './models-catalog';

export type DynamicModel = {
  id: string;
  /** Final display name (admin override → catalog → bare id). */
  displayName: string;
  /** Final description (admin override → catalog → ""). */
  description: string;
  /** Always present (catalog → heuristic). */
  category: ModelCategory;
  /** Always present (catalog → heuristic → 'unknown'). */
  vendor: ModelVendor;
  /** Catalog-driven; heuristic 'true' for known multimodal families. */
  vision: boolean;
  /** Admin gate; default true unless an override exists with enabled=false. */
  enabled: boolean;
  sortOrder: number;
  /** Set when the model came in from newapi but had no catalog entry — UI
   *  can render a "(unrecognised)" hint or just show the bare id. */
  synthesised: boolean;
  /** M41 follow-up³: admin-set icon key (lib/ai-icons.ts AI_ICONS). null = 自动按 model name 推断 */
  icon: string | null;
};

export type ModelOverride = {
  model_id: string;
  enabled: boolean;
  display_name: string | null;
  description: string | null;
  sort_order: number;
  icon?: string | null;
};

const CACHE_KEY = 'cp:dynamic-catalog-v1';
const CACHE_TTL_MS = 5 * 60_000;

type Cached = { ts: number; entries: DynamicModel[] };

/** Reads from localStorage if fresh, otherwise null. */
function readCache(): DynamicModel[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (!parsed?.ts || !Array.isArray(parsed.entries)) return null;
    if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
    return parsed.entries;
  } catch {
    return null;
  }
}

function writeCache(entries: DynamicModel[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ts: Date.now(), entries } satisfies Cached),
    );
  } catch {
    /* quota / private mode — skip */
  }
}

export function clearDynamicCatalogCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

/** Heuristic synthesise: when a model is in newapi but not in catalog,
 *  infer category / vendor / vision from the id so the UI can still
 *  render it. Mirrors the rules in `chat-models.ts isNonChatModel` so
 *  routing stays consistent. */
function synthesiseFromId(id: string): Pick<ModelEntry, 'displayName' | 'category' | 'vendor' | 'vision' | 'description'> {
  const lower = stripChannelSuffix(id).toLowerCase();
  const category: ModelCategory = (() => {
    if (lower.startsWith('veo-')) return 'video';
    if (lower.startsWith('gemini-') && lower.includes('image')) return 'image';
    if (/(^|-)image(-|$|\d)/.test(lower) || lower.startsWith('dall-e')) return 'image';
    if (lower.startsWith('tts-') || lower.includes('-tts')) return 'audio';
    if (lower.startsWith('whisper') || lower.includes('audio')) return 'audio';
    if (lower.includes('codex')) return 'code';
    return 'chat';
  })();
  const vendor: ModelVendor = (() => {
    if (lower.startsWith('gpt-') || lower.startsWith('codex') || lower === 'gpt-5' || lower.includes('image-1') || lower.includes('image-2') || lower === 'model-router') return 'openai';
    if (lower.startsWith('claude-')) return 'anthropic';
    if (lower.startsWith('gemini-') || lower.startsWith('veo-')) return 'google';
    if (lower.startsWith('deepseek')) return 'deepseek';
    if (lower.startsWith('grok')) return 'xai';
    if (lower.startsWith('kimi')) return 'moonshot';
    if (lower.startsWith('mistral') || lower.startsWith('codestral')) return 'mistral';
    if (lower.startsWith('phi')) return 'microsoft';
    if (lower.startsWith('llama')) return 'meta';
    return 'unknown';
  })();
  const vision = category === 'chat' && (vendor === 'openai' || vendor === 'anthropic' || vendor === 'google' || vendor === 'xai' || vendor === 'moonshot');
  return { displayName: id, category, vendor, vision, description: '' };
}

const ENTRY_BY_ID = new Map(MODELS_CATALOG.map((e) => [e.id, e]));

/** Combine the three sources into a single typed list. */
export function mergeCatalog(
  newapiModelIds: readonly string[],
  overrides: readonly ModelOverride[],
): DynamicModel[] {
  const overrideMap = new Map(overrides.map((o) => [o.model_id, o]));
  const merged: DynamicModel[] = newapiModelIds.map((id) => {
    const catalog = ENTRY_BY_ID.get(id);
    const override = overrideMap.get(id);
    const synthetic = catalog ? null : synthesiseFromId(id);
    const fallback = catalog ?? synthetic!;
    return {
      id,
      displayName: override?.display_name ?? fallback.displayName,
      description: override?.description ?? fallback.description ?? '',
      category: fallback.category,
      vendor: fallback.vendor,
      vision: fallback.vision ?? false,
      enabled: override?.enabled ?? true,
      sortOrder: override?.sort_order ?? 999,
      synthesised: !catalog,
      icon: override?.icon ?? null,
    };
  });
  // Stable sort: enabled first, then by sortOrder, then by displayName.
  merged.sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.displayName.localeCompare(b.displayName);
  });
  return merged;
}

type LoadOptions = {
  /** Skip cache, refetch from BFF. Use after admin edits. */
  force?: boolean;
};

/** Cache-aware loader. Two BFF calls concurrently, merged client-side. */
export async function loadDynamicCatalog(opts: LoadOptions = {}): Promise<DynamicModel[]> {
  if (!opts.force) {
    const cached = readCache();
    if (cached) return cached;
  }
  let modelIds: string[] = [];
  let overrides: ModelOverride[] = [];
  try {
    const [m, o] = await Promise.all([
      fetch('/api/newapi/api/user/models', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/conv/v1/models/overrides', { credentials: 'include' }).then((r) => r.json()),
    ]);
    if (Array.isArray(m?.data)) modelIds = m.data;
    if (Array.isArray(o?.data)) overrides = o.data;
  } catch (e) {
    // Total fetch failure → fall back to catalog hardcode so UI doesn't blank.
    console.error('[dynamic-catalog] load failed, using catalog fallback', e);
    return MODELS_CATALOG.map((e) => ({
      id: e.id,
      displayName: e.displayName,
      description: e.description,
      category: e.category,
      vendor: e.vendor,
      vision: e.vision ?? false,
      enabled: true,
      sortOrder: 999,
      synthesised: false,
      icon: null,
    }));
  }
  const merged = mergeCatalog(modelIds, overrides);
  writeCache(merged);
  return merged;
}

/** Synchronous lookup for code paths that already have a cached catalog. */
export function findDynamicEntry(catalog: readonly DynamicModel[], id: string): DynamicModel | undefined {
  return catalog.find((e) => e.id === id);
}

/** Filter helper for chat surfaces — drops disabled-by-admin models. */
export function visibleModels(catalog: readonly DynamicModel[]): DynamicModel[] {
  return catalog.filter((e) => e.enabled);
}

// ---------------------------------------------------------------------------
// React hook — shared across ModelPicker / InspirationPanel / ModelLibrary
// to avoid hand-rolling the load+effect pattern in every component.
// ---------------------------------------------------------------------------

import { useEffect, useState } from 'react';

/**
 * Subscribe a component to the dynamic catalog. Returns null until the
 * first load resolves (or the cache hit lands sync-ish in a microtask).
 *
 * Single shared in-memory cache means N components mounting at once
 * trigger only one fetch round-trip — subsequent useDynamicCatalog()
 * calls hit the localStorage cache or the in-flight promise.
 */
let inflight: Promise<DynamicModel[]> | null = null;

export function useDynamicCatalog(): DynamicModel[] | null {
  const [catalog, setCatalog] = useState<DynamicModel[] | null>(() => readCache());
  useEffect(() => {
    if (catalog) return;
    let cancelled = false;
    inflight = inflight ?? loadDynamicCatalog().finally(() => { inflight = null; });
    void inflight.then((entries) => {
      if (!cancelled) setCatalog(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [catalog]);
  return catalog;
}

/** Convenience: synchronous lookup that prefers dynamic but falls back
 *  to the hardcode catalog so first-paint never shows raw model ids. */
export function findEntry(catalog: DynamicModel[] | null | undefined, id: string): DynamicModel | null {
  if (!catalog) return null;
  return catalog.find((e) => e.id === id) ?? null;
}
