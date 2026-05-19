'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MessageSquarePlus } from 'lucide-react';
import { ModelLibrary } from '@/components/sidebar/ModelLibrary';
import { PRIMARY_NAV, isNavActive } from '@/components/shell/TopNav';
import { cn } from '@/lib/utils';

/**
 * M29-H: the sidebar is now model-first. History got its own page
 * (/history) with the top-nav "历史" entry — keeping it out of the
 * sidebar lets the model library breathe and matches the competitor
 * layout that prompted M29.
 *
 * Layout:
 *   - 56-px brand strip with "new chat" button on the right
 *   - the rest of the column is the model library (search + collapsed
 *     category tree)
 *
 * M40+: 在 mobile drawer 模式下 (`drawer` prop = true) 顶部多承接一组
 * PRIMARY_NAV 链接, 替代 TopNav 在 < md 隐藏的 6 项导航. desktop sidebar
 * (drawer=false) 不显示, 避免跟 TopNav 重复.
 */

export function SidebarBody({
  systemName,
  drawer = false,
}: {
  systemName: string;
  drawer?: boolean;
}) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  return (
    <>
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-3">
        {drawer && (
          <Link
            href={'/welcome' as never}
            className="truncate text-base font-semibold tracking-tight text-foreground"
            title={systemName}
          >
            {systemName}
          </Link>
        )}
        <Link
          href={'/welcome' as never}
          onClick={(e) => {
            // M42-S1 修复 "新建对话停留在原对话" bug — 根因: ChatPanel.handleSend
            // lazy-create conv 后用 history.replaceState 改 URL 但没 sync Next
            // App Router 内部 state, Next 仍认 path=/welcome → 用户在 /c/abc
            // 点本 Link 时 Next dedupe noop, 不导航. 强制 hard-nav 绕过.
            // 同 path 时也强制 — 用户期望"新建对话"是全新空白页, 即使 URL 已
            // 是 /welcome 但 ChatPanel state 有内容也要重置.
            if (typeof window !== 'undefined') {
              e.preventDefault();
              window.location.assign('/welcome');
            }
          }}
          className={cn(
            'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90',
            drawer ? 'flex-1' : 'ml-auto flex-1 md:px-4',
          )}
        >
          <MessageSquarePlus className="h-4 w-4" />
          <span>{t('newChat')}</span>
        </Link>
      </div>
      {drawer && (
        <nav className="border-b border-border/60 px-2 pb-2">
          {PRIMARY_NAV.map((item) => {
            const active = isNavActive(item.matchPaths, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href as never}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors duration-150',
                  active
                    ? 'bg-accent text-primary font-medium'
                    : 'text-foreground hover:bg-muted',
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={active ? 2 : 1.75} />
                <span>{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>
      )}
      <div className="flex-1 overflow-y-auto pb-3">
        <ModelLibrary />
      </div>
    </>
  );
}

/** Desktop fixed sidebar (hidden below md breakpoint). */
export function AppSidebar({
  systemName,
  isAdmin: _isAdmin = false,
}: {
  systemName: string;
  isAdmin?: boolean;
}) {
  return (
    <aside className="hidden w-[260px] shrink-0 flex-col border-r border-border bg-muted md:flex">
      <SidebarBody systemName={systemName} />
    </aside>
  );
}
