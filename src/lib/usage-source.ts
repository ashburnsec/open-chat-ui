'use client';

/**
 * Shared identification of "internal" tokens — the ones chat-portal
 * mints on the user's behalf rather than ones the user created via
 * `/keys`. Centralized here so the three callers (KeysPanel,
 * HowToPanel, UsagePanel) can't drift in their definitions.
 *
 * Three flavours:
 *   - `webchat`              — current internal name (M12-D)
 *   - `chat-portal-default`  — legacy name still in old DB rows
 *   - `playground-*`         — minted by new-api itself on first
 *                              `/pg/chat/completions` hit (see
 *                              new-api/controller/playground.go:50)
 */
export const INTERNAL_TOKEN_NAMES_EXACT: readonly string[] = [
  'webchat',
  'chat-portal-default',
];
export const INTERNAL_TOKEN_PREFIXES: readonly string[] = ['playground-'];

export function isInternalTokenName(raw: string | null | undefined): boolean {
  if (!raw) return false;
  if (INTERNAL_TOKEN_NAMES_EXACT.includes(raw)) return true;
  return INTERNAL_TOKEN_PREFIXES.some((p) => raw.startsWith(p));
}
