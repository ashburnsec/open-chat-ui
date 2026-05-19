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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pt-8 pb-4 sm:px-6 sm:pt-12">
      <div className="space-y-3">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-[var(--shadow-2)]">
          <Sparkles className="h-3 w-3" />
          {t('promoStrip')}
        </div>
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-3xl md:text-4xl">
          {t.rich('greeting', {
            systemName,
            brand: (chunks) => <span className="text-foreground">{chunks}</span>,
          })}
        </h1>
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          {systemName}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {QUICK_STARTS.map((item) => {
          const Icon = item.Icon;
          const className = cn(
            'group inline-flex h-8 items-center gap-2 rounded-md border border-border bg-background px-3 text-[13px] font-medium text-muted-foreground',
            'shadow-[var(--shadow-2)] transition-all duration-150',
            'hover:border-foreground/40 hover:text-foreground hover:-translate-y-px hover:shadow-[var(--shadow-3)]',
          );
          const content = (
            <>
              <Icon className="h-3.5 w-3.5 shrink-0 transition-colors" />
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
