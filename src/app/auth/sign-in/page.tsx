import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { SignInForm } from './sign-in-form';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { newapiFetch, type SystemStatus } from '@/lib/newapi-client';
import { resolveBrand } from '@/lib/brand';

// Read site status server-side so the OAuth buttons reflect what's enabled.
async function getStatus(): Promise<SystemStatus | null> {
  const r = await newapiFetch<SystemStatus>('/api/status');
  return r.success && r.data ? r.data : null;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; oauth_error?: string }>;
}) {
  const sp = await searchParams;
  const status = await getStatus();
  const t = await getTranslations('auth.signIn');
  return (
    <div className="w-full rounded-md border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
      <div className="mb-5 space-y-1">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          {resolveBrand(status?.system_name)}
        </h1>
        <p className="text-sm text-muted-foreground">{t('cardSubtitle')}</p>
      </div>
      <div className="space-y-4">
        {sp.oauth_error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {decodeURIComponent(sp.oauth_error)}
          </div>
        )}
        <Suspense fallback={null}>
          <SignInForm next={sp.next} />
        </Suspense>
        {status && <OAuthButtons status={status} next={sp.next} />}
        <p className="text-center text-sm text-muted-foreground">
          {t('noAccountPrompt')}{' '}
          <a
            href={`/auth/sign-up${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ''}`}
            className="text-foreground underline-offset-4 hover:underline"
          >
            {t('signUpLink')}
          </a>
          {' · '}
          <a href="/auth/reset" className="text-foreground underline-offset-4 hover:underline">
            {t('forgotPassword')}
          </a>
        </p>
      </div>
    </div>
  );
}
