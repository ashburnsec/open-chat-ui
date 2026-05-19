'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  Boxes,
  Brain,
  Calendar,
  HelpCircle,
  History,
  KeyRound,
  Languages,
  Lightbulb,
  Loader2,
  LogOut,
  MessageSquare,
  Settings2,
  Sparkles,
  User as UserIcon,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import type { SelfUser } from '@/lib/newapi-client';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AnnouncementBell } from '@/components/shell/AnnouncementBell';
import { BalancePill } from '@/components/shell/BalancePill';
import { CheckinButton } from '@/components/shell/CheckinButton';
import { HelpMenu } from '@/components/shell/HelpMenu';
import { LanguageToggle } from '@/components/shell/LanguageToggle';
import { MobileSidebarToggle } from '@/components/shell/MobileSidebarToggle';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/locales';
import { cn } from '@/lib/utils';

/** Deterministic colour bucket for user avatars — consistent across renders. */
function avatarBg(name: string): string {
  const palette = [
    'bg-blue-500', 'bg-violet-500', 'bg-emerald-500',
    'bg-rose-500',  'bg-amber-500',  'bg-sky-500',
    'bg-pink-500',  'bg-teal-500',
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/**
 * M29-A: top-level app navigation. Replaces the per-page HeaderBar's
 * right-cluster + sidebar's nav links with a single bar that owns:
 *
 *   left   — brand + 4 primary tabs (chat / agents / api / usage)
 *   right  — free-credits CTA, language + theme toggles, balance pill,
 *            user dropdown (settings + secondary destinations + sign out)
 *
 * The model picker, agent badge, and conversation list now live in the
 * left sidebar, not here. HeaderBar shrinks to just an agent badge for
 * conversation context (rendered inside ChatPanel).
 *
 * Layout split:
 *   - All authenticated routes wrap in `(chat)/layout.tsx` which renders
 *     this TopNav above the row[Sidebar + main].
 *   - Public landing / auth pages keep their own minimal headers — this
 *     bar only ships behind the auth gate.
 *
 * M40+ mobile 收纳: < md 隐藏 PRIMARY_NAV (drawer 承接); < md 把签到 /
 * 帮助 / 免费积分 收进 user dropdown; < sm 把语言切换也收进 dropdown.
 * 主题切换始终在 TopNav 保留, 它是个三态 dropdown 不便嵌入 menu item.
 */
// M37: 6 项顶级导航. mini-app 升格成独立 "智能体" 入口 (放第二位, 紧
// 邻聊天, 更显眼 + 反映"创作工坊"是主路径). "角色"指向合并后的 /agents
// 页 (单 feed: 助手 + 灵感, 不再分 tab).
// M40+: 导出给 mobile drawer 复用, 避免 < md 时 TopNav 6 个 icon 挤爆.
export const PRIMARY_NAV = [
  { href: '/welcome', labelKey: 'topChat', icon: MessageSquare, matchPaths: ['/welcome', '/c/'] },
  { href: '/mini-apps', labelKey: 'topMiniApps', icon: Boxes, matchPaths: ['/mini-apps'] },
  { href: '/agents', labelKey: 'topAgents', icon: Lightbulb, matchPaths: ['/agents'] },
  { href: '/history', labelKey: 'topHistory', icon: History, matchPaths: ['/history'] },
  { href: '/keys', labelKey: 'topApi', icon: KeyRound, matchPaths: ['/keys'] },
  { href: '/usage', labelKey: 'topUsage', icon: Sparkles, matchPaths: ['/usage'] },
] as const;

export function isNavActive(matchPaths: readonly string[], pathname: string): boolean {
  return matchPaths.some((p) =>
    p.endsWith('/') ? pathname.startsWith(p) : pathname === p || pathname.startsWith(`${p}/`),
  );
}

type FaqItem = { question: string; answer: string };
type CheckinStatus = {
  enabled: boolean;
  min_quota: number;
  max_quota: number;
  stats?: { checked_in_today?: boolean };
};

export function TopNav({
  user,
  quotaPerUnit,
  systemName,
  isAdmin,
}: {
  user: SelfUser;
  quotaPerUnit: number;
  systemName: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale() as Locale;
  const tNav = useTranslations('nav');
  const tCommon = useTranslations('common');
  const tCheckin = useTranslations('checkin');
  const tHelp = useTranslations('helpMenu');

  // M40+ < sm 段在 user dropdown 内承接 3 个组件的等价 menu item.
  // 状态托管在 TopNav, 不依赖 CheckinButton / HelpMenu / LanguageToggle 实例.
  const [faqOpen, setFaqOpen] = useState(false);
  const [faq, setFaq] = useState<FaqItem[] | null>(null);
  const [checkin, setCheckin] = useState<CheckinStatus | null>(null);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [, startLangTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/newapi/api/user/checkin');
        const j = await r.json();
        if (!cancelled) setCheckin(j?.success && j.data ? j.data : { enabled: false, min_quota: 0, max_quota: 0 });
      } catch {
        if (!cancelled) setCheckin({ enabled: false, min_quota: 0, max_quota: 0 });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!faqOpen || faq !== null) return;
    void (async () => {
      try {
        const r = await fetch('/api/newapi/api/status');
        const j = await r.json();
        setFaq((j?.data?.faq ?? []) as FaqItem[]);
      } catch {
        setFaq([]);
      }
    })();
  }, [faqOpen, faq]);

  async function doCheckin() {
    if (checkinLoading) return;
    setCheckinLoading(true);
    try {
      const r = await fetch('/api/newapi/api/user/checkin', { method: 'POST' });
      const j = await r.json();
      if (!j?.success) {
        toast.error(j?.message || tCheckin('failed'));
        return;
      }
      const awarded = j.data?.quota_awarded ?? 0;
      const usd = awarded / quotaPerUnit;
      toast.success(tCheckin('success', { amount: usd.toFixed(3) }));
      setCheckin((s) => (s ? { ...s, stats: { ...s.stats, checked_in_today: true } } : s));
      window.dispatchEvent(new CustomEvent('cp:wallet-changed'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tCheckin('failed'));
    } finally {
      setCheckinLoading(false);
    }
  }

  function toggleLocale() {
    const next = LOCALES.find((l) => l !== locale) ?? locale;
    if (next === locale) return;
    startLangTransition(async () => {
      try {
        const r = await fetch('/api/locale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: next }),
        });
        const j = await r.json();
        if (!j?.success) throw new Error('failed');
        router.refresh();
      } catch {
        toast.error(tCommon('error'));
      }
    });
  }

  const checkinAvailable = checkin?.enabled === true;
  const checkedToday = !!checkin?.stats?.checked_in_today;
  const nextLocale = LOCALES.find((l) => l !== locale) ?? locale;

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-border bg-background/95 px-3 backdrop-blur-sm md:px-4">
      <div className="flex min-w-0 items-center gap-3 md:gap-4">
        <MobileSidebarToggle systemName={systemName} isAdmin={isAdmin} />
        <Link
          href={'/welcome' as never}
          className="shrink-0 whitespace-nowrap text-sm font-semibold tracking-tight text-foreground"
        >
          {systemName}
        </Link>
        <div className="hidden h-4 w-px bg-border md:block" />
        {/* M40+: < md 整组隐藏 (drawer 承接); md-lg 段只显示 icon; lg+ 加文字 */}
        <nav className="hidden items-center gap-0.5 md:flex">
          {PRIMARY_NAV.map((item) => {
            const active = isNavActive(item.matchPaths, pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href as never}
                title={tNav(item.labelKey)}
                className={cn(
                  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1.5 text-[13px] font-medium transition-all duration-150 xl:px-2.5',
                  active
                    ? 'bg-foreground/90 text-background'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={active ? 2.2 : 1.75} />
                <span className="hidden xl:inline">{tNav(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>
      </div>
      {/* 右侧 cluster */}
      <div className="flex shrink-0 items-center gap-1" data-topnav-actions>
        <div className="hidden lg:contents">
          <CheckinButton quotaPerUnit={quotaPerUnit} />
          <HelpMenu />
        </div>
        <AnnouncementBell />
        <div className="hidden h-4 w-px bg-border lg:block" />
        <div className="hidden sm:contents">
          <LanguageToggle />
        </div>
        <ThemeToggle />
        <div className="hidden h-4 w-px bg-border sm:block" />
        <BalancePill initialUser={user} quotaPerUnit={quotaPerUnit} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-accent"
              aria-label={tNav('accountMenu')}
            >
              <Avatar className="h-6 w-6">
                <AvatarFallback
                  className={cn(
                    'text-[10px] font-bold text-white',
                    avatarBg(user.username || '?'),
                  )}
                >
                  {(user.username || '?').slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[96px] truncate text-[13px] font-medium lg:inline">
                {user.display_name || user.username}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>{user.username}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* < lg 段承接被隐藏的右侧 action: 签到 / 常见问题 */}
            {checkinAvailable && (
              <DropdownMenuItem
                className="lg:hidden"
                disabled={checkinLoading || checkedToday}
                onSelect={(e) => {
                  e.preventDefault();
                  void doCheckin();
                }}
              >
                {checkinLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Calendar className="h-4 w-4" />
                )}
                <span>{checkedToday ? tCheckin('alreadyToday') : tCheckin('label')}</span>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="lg:hidden"
              onSelect={() => setFaqOpen(true)}
            >
              <HelpCircle className="h-4 w-4" />
              <span>{tHelp('faq')}</span>
            </DropdownMenuItem>
            {/* < sm 段额外: 切换语言 (ThemeToggle 保留在 TopNav 上) */}
            <DropdownMenuItem
              className="sm:hidden"
              onSelect={(e) => {
                e.preventDefault();
                toggleLocale();
              }}
            >
              <Languages className="h-4 w-4" />
              <span>
                {tNav('toggleLanguage')} · {LOCALE_LABELS[nextLocale]}
              </span>
            </DropdownMenuItem>
            <DropdownMenuSeparator className="lg:hidden" />
            <DropdownMenuItem asChild>
              <a href="/settings">
                <UserIcon className="h-4 w-4" />
                <span>{tNav('settings')}</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/purchase">
                <Wallet className="h-4 w-4" />
                <span>{tNav('topUp')}</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/subscription">
                <Sparkles className="h-4 w-4" />
                <span>{tNav('subscriptionShort')}</span>
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href="/memory">
                <Brain className="h-4 w-4" />
                <span>{tNav('memoryShort')}</span>
              </a>
            </DropdownMenuItem>
            {isAdmin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href="/admin/models">
                    <Settings2 className="h-4 w-4" />
                    <span>{tNav('adminModels')}</span>
                  </a>
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={async () => {
                await fetch('/api/auth/logout', { method: 'POST' });
                router.replace('/' as never);
                router.refresh();
              }}
            >
              <LogOut className="h-4 w-4" />
              <span>{tCommon('signOut')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* M40+ < md 时承接 HelpMenu 的 FAQ Dialog */}
      <Dialog open={faqOpen} onOpenChange={setFaqOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{tHelp('faq')}</DialogTitle>
            <DialogDescription className="sr-only">{tHelp('faq')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {faq === null ? (
              <div className="py-6 text-center text-sm text-muted-foreground">...</div>
            ) : faq.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">—</div>
            ) : (
              <div className="divide-y">
                {faq.map((q, i) => (
                  <details key={i} className="group py-2">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium hover:text-primary">
                      <span className="text-left">{q.question}</span>
                      <span className="shrink-0 text-xs text-muted-foreground transition-transform group-open:rotate-90">›</span>
                    </summary>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{q.answer}</div>
                  </details>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
