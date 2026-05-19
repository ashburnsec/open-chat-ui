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
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
        {drawer && (
          <Link
            href={'/welcome' as never}
            className="shrink-0 truncate text-[13px] font-semibold tracking-tight text-foreground"
            title={systemName}
          >
            {systemName}
          </Link>
        )}
        <Link
          href={'/welcome' as never}
          onClick={(e) => {
            if (typeof window !== 'undefined') {
              e.preventDefault();
              window.location.assign('/welcome');
            }
          }}
          className={cn(
            'inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 text-[13px] font-medium text-background transition-all hover:opacity-90 active:scale-[0.98]',
            !drawer && 'ml-auto',
          )}
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          <span>{t('newChat')}</span>
        </Link>
      </div>
      {drawer && (
        <nav className="border-b border-border/60 px-2 py-2">
          {PRIMARY_NAV.map((item) => {
            const active = isNavActive(item.matchPaths, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href as never}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors duration-150',
                  active
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={active ? 2.2 : 1.75} />
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
    <aside className="hidden w-[248px] shrink-0 flex-col border-r border-border bg-background md:flex">
      <SidebarBody systemName={systemName} />
    </aside>
  );
}
