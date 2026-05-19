'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import type { SystemStatus } from '@/lib/newapi-client';

type Provider = {
  id: string;
  name: string;
  authorize: (state: string) => string;
};

/**
 * Render OAuth buttons only for providers new-api has enabled (per /api/status).
 * Each button:
 *   1. fetches a CSRF state from our BFF (which proxies to new-api),
 *   2. redirects to the provider's authorize URL with our callback as redirect_uri.
 */
export function OAuthButtons({ status, next }: { status: SystemStatus; next?: string }) {
  const t = useTranslations('auth.oauth');
  const providers: Provider[] = [];

  if (status.github_oauth && status.github_client_id) {
    const cb = `${origin()}/auth/oauth/github/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`;
    providers.push({
      id: 'github',
      name: 'GitHub',
      authorize: (state) =>
        `https://github.com/login/oauth/authorize?client_id=${status.github_client_id}` +
        `&redirect_uri=${encodeURIComponent(cb)}` +
        `&scope=user:email&state=${encodeURIComponent(state)}`,
    });
  }
  if (status.discord_oauth && status.discord_client_id) {
    const cb = `${origin()}/auth/oauth/discord/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`;
    providers.push({
      id: 'discord',
      name: 'Discord',
      authorize: (state) =>
        `https://discord.com/api/oauth2/authorize?response_type=code&client_id=${status.discord_client_id}` +
        `&redirect_uri=${encodeURIComponent(cb)}&scope=identify%20email&state=${encodeURIComponent(state)}`,
    });
  }

  // Custom OAuth providers (Google etc. configured at runtime in new-api admin)
  for (const cp of status.custom_oauth_providers ?? []) {
    if (!cp.authorization_endpoint) continue;
    const cb = `${origin()}/auth/oauth/${encodeURIComponent(cp.id)}/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`;
    providers.push({
      id: cp.id,
      name: cp.name,
      authorize: (state) =>
        `${cp.authorization_endpoint}?response_type=code&redirect_uri=${encodeURIComponent(cb)}` +
        `&scope=openid%20email%20profile&state=${encodeURIComponent(state)}`,
    });
  }

  if (providers.length === 0) return null;

  async function go(p: Provider) {
    const r = await fetch('/api/auth/oauth-state');
    const json = await r.json();
    if (!json.success) {
      alert(json.message || t('stateFailed'));
      return;
    }
    window.location.href = p.authorize(json.data);
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
        <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">{t('divider')}</span></div>
      </div>
      {providers.map((p) => (
        <Button key={p.id} type="button" variant="outline" className="w-full" onClick={() => go(p)}>
          {t('signInWith', { name: p.name })}
        </Button>
      ))}
    </div>
  );
}

function origin() {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}
