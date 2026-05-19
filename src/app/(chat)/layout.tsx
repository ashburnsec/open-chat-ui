import { redirect } from 'next/navigation';
import { newapi } from '@/lib/newapi';
import type { SystemStatus } from '@/lib/newapi-client';
import { getCurrentUser } from '@/lib/auth';
import { AppSidebar } from '@/components/shell/AppSidebar';
import { TopNav } from '@/components/shell/TopNav';
import { resolveBrand } from '@/lib/brand';

/**
 * M29-A: top-nav + left-sidebar shell. The right-side WorkspacePanel
 * was removed (its Files / Plugins tabs offered no user-facing value
 * and `useToolUsage` only ever wrote to localStorage). Primary nav
 * lives in the top bar; the sidebar is reserved for the model library
 * (added in M29-C) and conversation history.
 *
 * Server Component: pulls user + status once per request via the
 * `cache()`-wrapped helpers. Children inherit responsibility for
 * their own per-page chrome.
 */
export default async function ChatShellLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/sign-in' as never);

  const statusRes = await newapi<SystemStatus>('/api/status');
  const sysName = resolveBrand(statusRes.success ? statusRes.data?.system_name : null);
  const quotaPerUnit = (statusRes.success && statusRes.data?.quota_per_unit) || 500_000;
  const isAdmin = user.role >= 100;

  return (
    // M40+: 用 svh / dvh 取代 100vh, 避开 iOS Safari 地址栏把 composer
    // 挤出视口. svh 是"小视口"(地址栏出现时的 size), 保证最少能容下;
    // dvh 是动态值, 地址栏 hide 后会跟着增高. 给 main 一个 minmax 防抖.
    <div className="flex h-[100svh] max-h-[100dvh] w-screen flex-col overflow-hidden bg-background">
      <TopNav
        user={user}
        quotaPerUnit={quotaPerUnit}
        systemName={sysName}
        isAdmin={isAdmin}
      />
      <div className="flex min-h-0 flex-1">
        <AppSidebar systemName={sysName} isAdmin={isAdmin} />
        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
