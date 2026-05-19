/**
 * Cached server-side status fetcher. Mirrors `getCurrentUser()`'s pattern
 * so layouts and pages can both call this without thrashing /api/status.
 */
import { cache } from 'react';
import type { SystemStatus } from '@/lib/newapi-client';
import { newapi } from './newapi';

export const getStatus = cache(async (): Promise<SystemStatus> => {
  const r = await newapi<SystemStatus>('/api/status');
  if (r.success && r.data) return r.data;
  // Fallback skeleton — keeps the shell renderable when new-api is reachable
  // but returning an unexpected shape (during version migrations, etc.).
  return {
    version: 'unknown',
    start_time: 0,
    email_verification: false,
    github_oauth: false,
    discord_oauth: false,
    linuxdo_oauth: false,
    oidc_enabled: false,
    passkey_login: false,
    telegram_oauth: false,
    wechat_login: false,
    theme: 'default',
    system_name: 'Chat Portal',
    logo: '',
    footer_html: '',
    server_address: '',
    turnstile_check: false,
    quota_per_unit: 500_000,
    display_in_currency: false,
    enable_drawing: false,
    enable_task: false,
    enable_data_export: false,
    checkin_enabled: false,
    api_info_enabled: false,
    announcements_enabled: false,
    faq_enabled: false,
  } satisfies SystemStatus;
});
