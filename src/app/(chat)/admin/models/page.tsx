import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/auth';
import { loadAdminModels } from '@/lib/admin-models';
import { ModelDisplayPanel } from '@/components/admin/ModelDisplayPanel';

export const dynamic = 'force-dynamic';

/**
 * Admin model display management. The billing/ratio config lives entirely
 * in your upstream newapi instance. Here we only own:
 *
 *   - enabled toggle (whether to surface a model to C-end users)
 *   - display_name override (e.g. "Nano Banana" → "谷歌大香蕉")
 *   - description override
 *   - sort_order (picker ordering)
 *
 * Hard-gated to role >= 100 (root) — the conv-svc backend re-checks via
 * requireAdmin, so 401s come back the same as 403s if the role check
 * fails server-side. notFound() (not 403) for non-admins so we don't
 * confirm the page exists to regular users.
 */
export default async function AdminModelsPage() {
  const user = await getCurrentUser();
  if (!user || user.role < 100) notFound();
  const payload = await loadAdminModels();
  const t = await getTranslations('admin.models');
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>{t('counts.newapi', { n: payload.counts.newapi })}</div>
          <div>{t('counts.overrides', { n: payload.counts.overrides })}</div>
          {payload.counts.stale > 0 && (
            <div className="text-amber-600 dark:text-amber-400">
              {t('counts.stale', { n: payload.counts.stale })}
            </div>
          )}
        </div>
      </header>
      <ModelDisplayPanel initial={payload.models} />
      <p className="mt-6 text-xs text-muted-foreground">
        {t('billingHint')}
      </p>
      </div>
    </div>
  );
}
