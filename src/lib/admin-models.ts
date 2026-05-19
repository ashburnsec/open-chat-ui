/**
 * M34: server-side helpers for the admin "model display" page.
 * Replaces the old per-model billing-ratio editor — billing is now
 * managed entirely in newapi (your upstream newapi).
 *
 * Reads the merged catalog from conv-svc /v1/admin/models — that route
 * joins newapi's available-model list with chat_portal's overrides
 * table and returns one row per model with current display_name /
 * description / enabled / sort_order. Stale-override rows (model_id
 * that newapi no longer routes) are sorted to the end.
 */

import { convFetch } from './conv';

export type AdminModel = {
  model_id: string;
  enabled: boolean;
  display_name: string | null;
  description: string | null;
  sort_order: number;
  /** M41 follow-up³: admin 选的图标 key (lib/ai-icons.ts AI_ICONS). */
  icon: string | null;
  updated_at: string | null;
  updated_by: number | null;
};

export type AdminModelsPayload = {
  models: AdminModel[];
  counts: { newapi: number; overrides: number; stale: number };
};

export async function loadAdminModels(): Promise<AdminModelsPayload> {
  const r = (await convFetch('/v1/admin/models')) as unknown as {
    success?: boolean;
    message?: string;
    data?: AdminModel[];
    counts?: AdminModelsPayload['counts'];
  };
  if (!r.success || !r.data) {
    throw new Error(r.message || 'failed to load admin models');
  }
  return {
    models: r.data,
    counts: r.counts ?? { newapi: 0, overrides: 0, stale: 0 },
  };
}
