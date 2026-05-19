'use client';

import { useTranslations } from 'next-intl';
import { ExternalLink } from 'lucide-react';
import { CodeBlock } from './CodeBlock';
import { renderTemplate, TOOL_METAS, type ToolId } from '@/lib/developer-config';

/**
 * One tool's complete onboarding card: install (optional) + config
 * snippet (env-vars or UI walk-through) + curl test command. The
 * supplied `token` is interpolated into both the displayed code and
 * the clipboard payload — when null, a visible <YOUR_API_KEY>
 * placeholder shows up instead, so screenshots / shared links don't
 * leak anything.
 */
export function ToolGuideCard({
  toolId,
  token,
}: {
  toolId: ToolId;
  token: string | null;
}) {
  const t = useTranslations('developer');
  const meta = TOOL_METAS[toolId];
  const config = renderTemplate(meta.configTemplate, token);
  const test = renderTemplate(meta.testCommand, token);
  const installs = meta.installCommands?.join('\n') ?? '';

  return (
    <div className="rounded-md border bg-card/60 p-5 backdrop-blur-sm md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold tracking-tight">
            {t(`tools.${toolId}.title`)}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(`tools.${toolId}.subtitle`)}
          </p>
          <p className="mt-1 text-xs font-medium text-destructive/80">
            {t(`tools.${toolId}.recommendedModel`)}
          </p>
        </div>
        <a
          href={t(`tools.${toolId}.linkUrl`)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border bg-card px-3 py-1.5 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <span>{t(`tools.${toolId}.linkLabel`)}</span>
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {installs && (
        <section className="mt-4">
          <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
            {t('configBlock.installHint')}
          </h4>
          <CodeBlock
            code={installs}
            copyLabel={t('baseUrl.copy')}
            copiedLabel={t('baseUrl.copied')}
          />
        </section>
      )}

      <section className="mt-4">
        <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          {t(meta.configKind === 'env' ? 'configBlock.envHint' : 'configBlock.uiHint')}
        </h4>
        <CodeBlock
          code={config}
          copyLabel={t('configBlock.copyAll')}
          copiedLabel={t('baseUrl.copied')}
        />
      </section>

      <section className="mt-4">
        <h4 className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
          {t('configBlock.testHint')}
        </h4>
        <CodeBlock
          code={test}
          copyLabel={t('baseUrl.copy')}
          copiedLabel={t('baseUrl.copied')}
        />
      </section>
    </div>
  );
}
