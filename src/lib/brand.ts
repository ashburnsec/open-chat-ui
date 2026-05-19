/**
 * Single source of truth for the user-facing product name.
 *
 * The upstream new-api `system_name` field is exposed in /api/status
 * and ships pre-set with "New API". If we surface that verbatim, the
 * UI leaks the upstream origin to end users. Treat the well-known
 * defaults ("New API", legacy "Chat Portal") as "no name was set" and
 * fall back to the configured brand. An admin who explicitly customizes
 * system_name to something else still wins (white-label friendliness).
 *
 * The brand name is env-driven (`NEXT_PUBLIC_BRAND_NAME`) so anyone
 * deploying this UI can drop in their own product name without touching
 * code. Defaults to "Open Chat".
 */

export const BRAND = process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || 'Open Chat';

const UPSTREAM_DEFAULTS = new Set(['', 'New API', 'Chat Portal']);

export function resolveBrand(systemName: string | null | undefined): string {
  if (!systemName) return BRAND;
  return UPSTREAM_DEFAULTS.has(systemName) ? BRAND : systemName;
}
