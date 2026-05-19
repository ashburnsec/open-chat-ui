'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Boxes, Code2, ImageIcon, MessagesSquare, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

/** M40+: chip 分两种 — `href` 跳页, `prompt` prefill 到 composer. */
type QuickStart =
  | { key: string; kind: 'link'; href: string; Icon: React.ComponentType<{ className?: string }>; iconCls: string }
  | { key: string; kind: 'prefill'; prompt: string; Icon: React.ComponentType<{ className?: string }>; iconCls: string };

const QUICK_STARTS: readonly QuickStart[] = [
  { key: 'newChat',  kind: 'prefill', prompt: '', Icon: MessagesSquare, iconCls: 'text-blue-500' },
  { key: 'image',   kind: 'link',    href: '/mini-apps', Icon: ImageIcon,    iconCls: 'text-violet-500' },
  { key: 'agents',  kind: 'link',    href: '/agents',    Icon: Boxes,        iconCls: 'text-amber-500'  },
  { key: 'code',    kind: 'prefill', prompt: '请帮我审查或优化以下代码：\n\n```\n\n```\n', Icon: Code2, iconCls: 'text-emerald-500' },
];

const COMPOSER_PREFILL_EVENT = 'cp:composer-prefill';

function dispatchPrefill(text: string) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(COMPOSER_PREFILL_EVENT, { detail: text }));
}

/**
 * Empty-state hero shown when a chat has no messages yet.
 *
 * M40+ 去掉了"推荐 agent grid"区 (用户报点击无反应; 入口已在 /agents). 现在
 * 只剩 promo pill + greeting + quick-start chips (跳页 or prefill prompt).
 */
export function WelcomeBanner({ systemName }: { systemName: string }) {
  const t = useTranslations('chat.welcome');
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-10 pb-4 sm:px-6 sm:pt-14">
      <div className="space-y-4">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <Sparkles className="h-3 w-3 text-amber-500" />
          {t('promoStrip')}
        </div>
        <h1 className="text-balance text-2xl font-semibold leading-snug tracking-tight text-foreground sm:text-3xl md:text-[2.25rem]">
          {t.rich('greeting', {
            systemName,
            brand: (chunks) => <span className="text-foreground">{chunks}</span>,
          })}
        </h1>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {systemName}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {QUICK_STARTS.map((item) => {
          const Icon = item.Icon;
          const chipCls = cn(
            'group inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-3 text-[13px] font-medium text-muted-foreground',
            'transition-all duration-150 hover:border-foreground/30 hover:text-foreground hover:-translate-y-px hover:shadow-[var(--shadow-3)]',
          );
          const content = (
            <>
              <Icon className={cn('h-3.5 w-3.5 shrink-0', item.iconCls)} strokeWidth={1.75} />
              <span>{t(`quickStarts.${item.key}`)}</span>
            </>
          );
          if (item.kind === 'link') {
            return (
              <Link key={item.key} href={item.href as never} className={chipCls}>
                {content}
              </Link>
            );
          }
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => dispatchPrefill(item.prompt)}
              className={chipCls}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
