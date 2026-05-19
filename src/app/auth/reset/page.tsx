import { getTranslations } from 'next-intl/server';
import { ResetForm } from './reset-form';

/**
 * /auth/reset
 *
 * Two visual states are rendered by ResetForm based on whether `email`
 * and `token` query params are present:
 *
 *   No token (entry):       Show "enter email" form. POST triggers email.
 *   Token present (return): Auto-submit token, show generated password.
 */
export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const sp = await searchParams;
  const t = await getTranslations('auth.reset');
  return (
    <div className="w-full rounded-md border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
      <div className="mb-5 space-y-1">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">
          {sp.token ? t('confirm.cardSubtitle') : t('request.cardSubtitle')}
        </p>
      </div>
      <ResetForm initialEmail={sp.email} initialToken={sp.token} />
    </div>
  );
}
