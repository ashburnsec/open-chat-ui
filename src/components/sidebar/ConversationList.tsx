'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MoreHorizontal, Pencil, Archive, Trash2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/hooks/use-confirm';
import type { Conversation } from '@/lib/conv';

/**
 * Conversation history list under the sidebar's "新对话" entry.
 *
 * Loads on mount, polls every 30s in case another tab/device adds a
 * conversation. Items show their title; per-item dropdown offers rename
 * / archive / delete. Active conversation gets a highlighted background.
 *
 * We expose `refresh()` via a custom event (`cp:conversations-changed`)
 * so other components — notably the chat page after creating a new
 * conversation — can invalidate the cache without prop drilling.
 */
export function ConversationList() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('chat.list');
  const tCommon = useTranslations('common');
  const confirm = useConfirm();
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  // M29-G: sidebar shows the most recent 20 for quick switching;
  // the full archive lives at /history.
  async function load() {
    try {
      const r = await fetch('/api/conversations?limit=20', { cache: 'no-store' });
      const j = await r.json();
      if (j?.success) setItems(j.data?.items ?? []);
    } catch {
      /* keep stale data on transient failure */
    }
  }

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener('cp:conversations-changed', onChange);
    const interval = setInterval(() => {
      if (!document.hidden) void load();
    }, 30_000);
    return () => {
      window.removeEventListener('cp:conversations-changed', onChange);
      clearInterval(interval);
    };
  }, []);

  async function rename(id: string, title: string) {
    setEditingId(null);
    if (!title.trim()) return;
    await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    void load();
  }

  async function archive(id: string) {
    await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });
    if (pathname === `/c/${id}`) router.replace('/welcome' as never);
    void load();
    toast.success(t('archived'));
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: t('deleteConfirmTitle'),
      description: t('deleteConfirm'),
      confirmLabel: t('delete'),
      cancelLabel: tCommon('cancel'),
      variant: 'destructive',
    });
    if (!ok) return;
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    if (pathname === `/c/${id}`) router.replace('/welcome' as never);
    void load();
    toast.success(t('deleted'));
  }

  if (items === null) {
    return <div className="px-3 py-2 text-xs text-muted-foreground">{tCommon('loading')}</div>;
  }
  if (items.length === 0) {
    return <div className="px-3 py-2 text-xs text-muted-foreground">{t('empty')}</div>;
  }

  return (
    <div className="space-y-0.5">
      {items.map((c) => {
        const active = pathname === `/c/${c.id}`;
        const editing = editingId === c.id;
        return (
          <div
            key={c.id}
            className={cn(
              'group flex items-center rounded-md px-2 py-1.5 text-sm transition-colors duration-150',
              active
                ? 'bg-accent text-primary'
                : 'text-foreground hover:bg-card',
            )}
          >
            {editing ? (
              <input
                autoFocus
                defaultValue={editingTitle}
                onBlur={(e) => rename(c.id, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') rename(c.id, e.currentTarget.value);
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="w-full bg-transparent text-sm outline-none"
              />
            ) : (
              <Link
                href={`/c/${c.id}` as never}
                className="flex-1 truncate"
                title={c.title}
              >
                {c.title}
              </Link>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground opacity-100 hover:bg-accent hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 data-[state=open]:opacity-100"
                  aria-label={t('actionsMenu')}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() => {
                    setEditingTitle(c.title);
                    setEditingId(c.id);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" /> {t('rename')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void archive(c.id)}>
                  <Archive className="h-3.5 w-3.5" /> {t('archive')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => void remove(c.id)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t('delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
      <SeeAllLink />
    </div>
  );
}

/** Footer button on the sidebar list — pivots to the full /history page. */
function SeeAllLink() {
  const t = useTranslations('history');
  return (
    <Link
      href={'/history' as never}
      className="mt-1 flex items-center justify-between rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
    >
      <span>{t('seeAll')}</span>
      <ArrowRight className="h-3 w-3" />
    </Link>
  );
}

/** Fire from anywhere (chat send handler, conv create) to refresh the sidebar. */
export function notifyConversationsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('cp:conversations-changed'));
  }
}
