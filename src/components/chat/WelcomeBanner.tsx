'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Boxes, Code2, ImageIcon, MessagesSquare, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

/** M40+: chip 分两种 — `href` 跳页, `prompt` prefill 到 composer.
 *  之前 newChat / code 都指向 /welcome 本页, Link 同页跳转无效 (用户报 bug).
 *  现在改成 dispatch 'cp:composer-prefill' window event, ChatComposer 监听
 *  填入 textarea + focus, 用户可继续编辑. */
type QuickStart =
  | { key: string; kind: 'link'; href: string; Icon: React.ComponentType<{ className?: string }> }
  | { key: string; kind: 'prefill'; prompt: string; Icon: React.ComponentType<{ className?: string }> };
const QUICK_STARTS: readonly QuickStart[] = [
  { key: 'newChat', kind: 'prefill', prompt: '', Icon: MessagesSquare },
  { key: 'image', kind: 'link', href: '/mini-apps', Icon: ImageIcon },
  // chip label 跟 TopNav nav 对齐: "角色" → /agents (角色库 + 灵感广场)
  { key: 'agents', kind: 'link', href: '/agents', Icon: Boxes },
  {
    key: 'code',
    kind: 'prefill',
    prompt: '请帮我审查或优化以下代码：\n\n```\n\n```\n',
    Icon: Code2,
  },
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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pt-4 pb-3 sm:gap-6 sm:px-6 sm:pt-8 sm:pb-4">
      <div className="space-y-1.5">
        <div className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2 py-0.5 text-[11px] font-medium text-ink">
          <Sparkles className="h-3 w-3" />
          {t('promoStrip')}
        </div>
        <h1 className="text-xl font-semibold leading-tight tracking-tight text-foreground sm:text-2xl md:text-3xl">
          {t.rich('greeting', {
            systemName,
            brand: (chunks) => <span className="text-ink">{chunks}</span>,
          })}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {QUICK_STARTS.map((item) => {
          const Icon = item.Icon;
          const className = cn(
            'group inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground',
            'transition-colors duration-150',
            'hover:border-ink hover:text-ink',
          );
          const content = (
            <>
              <Icon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-ink" />
              <span>{t(`quickStarts.${item.key}`)}</span>
            </>
          );
          if (item.kind === 'link') {
            return (
              <Link key={item.key} href={item.href as never} className={className}>
                {content}
              </Link>
            );
          }
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => dispatchPrefill(item.prompt)}
              className={className}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}
