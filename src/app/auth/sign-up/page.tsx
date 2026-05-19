import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { SignUpForm } from './sign-up-form';
import { newapiFetch, type SystemStatus } from '@/lib/newapi-client';
import { resolveBrand } from '@/lib/brand';

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; aff?: string }>;
}) {
  const sp = await searchParams;
  const r = await newapiFetch<SystemStatus>('/api/status');
  const status = r.success && r.data ? r.data : null;
  const t = await getTranslations('auth.signUp');
  return (
    <div className="w-full rounded-md border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
      <div className="mb-5 space-y-1">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          {resolveBrand(status?.system_name)}
        </h1>
        <p className="text-sm text-muted-foreground">{t('cardSubtitle')}</p>
      </div>
      <div className="space-y-4">
        {sp.aff && (
          <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700">
            {t.rich('affApplied', {
              aff: sp.aff,
              code: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </p>
        )}
        <Suspense fallback={null}>
          <SignUpForm
            next={sp.next}
            affCode={sp.aff}
            emailVerificationRequired={status?.email_verification ?? false}
          />
        </Suspense>
        <p className="text-center text-sm text-muted-foreground">
          {t('signInPrompt')}{' '}
          <a
            href={`/auth/sign-in${sp.next ? `?next=${encodeURIComponent(sp.next)}` : ''}`}
            className="text-foreground underline-offset-4 hover:underline"
          >
            {t('signInLink')}
          </a>
        </p>
      </div>
    </div>
  );
}
