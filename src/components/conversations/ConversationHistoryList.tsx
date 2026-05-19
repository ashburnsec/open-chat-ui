'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Download, FileText, MoreHorizontal, Pencil, Archive, Share2, Trash2, Pin, PinOff, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useConfirm } from '@/hooks/use-confirm';
import { VendorMonogram } from '@/components/chat/VendorMonogram';
import {
  notifyConversationsChanged,
} from '@/components/sidebar/ConversationList';
import type { Conversation, ConvMessage } from '@/lib/conv';
import {
  buildExportFilename,
  buildMarkdown,
  downloadMarkdown,
  type ExportLabels,
} from '@/lib/conv-export';
import { ShareModal } from '@/components/conversations/ShareModal';

type ContentSearchHit = {
  convId: string;
  title: string;
  model: string;
  updatedAt: string;
  snippet: string;
  matchedMessageId: number | null;
  matchKind: 'title' | 'content' | 'both';
};

/**
 * M29-G: standalone history page list. Same data source as the sidebar
 * `<ConversationList>`, but with extra detail per row (model badge, last-
 * activity timestamp, pinned chip) and top filters (search + pinned-only).
 *
 * Why a separate component instead of upgrading ConversationList: the
 * sidebar trades detail for vertical density (one line per conv); this
 * page wants every row to breathe so users can scan a longer list.
 *
 * Backend-side: `/api/conversations` already excludes archived rows, so
 * "archived" tab is V2 (would need a `?include_archived=1` param).
 *
 * M31-C: a "搜内容" toggle next to the search input flips the list into
 * content-search mode, calling /api/conversations/search server-side.
 * Each hit shows a snippet + a deep link to /c/{convId}#m{matchedMsgId}
 * so the chat page can scroll to the matched message.
 */
export function ConversationHistoryList() {
  const t = useTranslations('history');
  const tExport = useTranslations('history.export');
  const tList = useTranslations('chat.list');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const confirm = useConfirm();

  const exportLabels: ExportLabels = useMemo(
    () => ({
      meta: ({ model, createdAt, count }) =>
        tExport('metaLine', { model: model || '—', createdAt, count }),
      user: tExport('userTurn'),
      assistant: tExport('assistantTurn'),
      tokens: ({ prompt, completion }) =>
        tExport('tokensLine', { prompt, completion }),
      emptyAssistant: tExport('emptyAssistant'),
    }),
    [tExport],
  );

  async function exportConversation(conv: Conversation) {
    const dismiss = toast.loading(tExport('exporting'));
    try {
      const r = await fetch(
        `/api/conversations/${encodeURIComponent(conv.id)}/messages?limit=500`,
        { cache: 'no-store' },
      );
      const j = (await r.json()) as { success: boolean; message?: string; data?: { items?: ConvMessage[] } };
      if (!j.success) throw new Error(j.message || `HTTP ${r.status}`);
      const items = j.data?.items ?? [];
      const md = buildMarkdown(conv, items, exportLabels);
      const filename = buildExportFilename(conv.title);
      downloadMarkdown(filename, md);
      toast.success(tExport('success', { filename }), { id: dismiss });
    } catch (e) {
      toast.error(
        tExport('failed', { message: e instanceof Error ? e.message : 'unknown' }),
        { id: dismiss },
      );
    }
  }

  const [items, setItems] = useState<Conversation[] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pinned'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  // M31-C: when on, search hits message bodies (server-side ILIKE) instead
  // of just the conv title. Debounced 300 ms so each keystroke doesn't
  // hammer the SQL endpoint. Default 'content' since users expect chat
  // search to find what's in the chat — title-only is the niche mode.
  const [searchMode, setSearchMode] = useState<'title' | 'content'>('content');
  const [contentHits, setContentHits] = useState<ContentSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchSeqRef = useRef(0);
  // M31-B: share modal state. Tracks the conv being shared so we can
  // pass title into the modal copy.
  const [shareConv, setShareConv] = useState<Conversation | null>(null);

  async function load() {
    try {
      const r = await fetch('/api/conversations?limit=100', { cache: 'no-store' });
      const j = await r.json();
      if (j?.success) setItems(j.data?.items ?? []);
    } catch {
      // keep stale on transient failure
    }
  }

  useEffect(() => {
    void load();
    const onChange = () => void load();
    window.addEventListener('cp:conversations-changed', onChange);
    return () => window.removeEventListener('cp:conversations-changed', onChange);
  }, []);

  const filtered = useMemo(() => {
    if (!items) return null;
    // content 模式 + 有搜索词时, server-side ContentResults 接管, 这里
    // 直接返回完整列表 (不被使用). 其他情况 (title 模式 / content 无
    // 搜索词) 走客户端 pinned + title 过滤.
    if (searchMode === 'content' && query.trim()) return items;
    const q = searchMode === 'title' ? query.trim().toLowerCase() : '';
    return items.filter((c) => {
      if (filter === 'pinned' && !c.pinned) return false;
      if (q && !c.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, query, filter, searchMode]);

  // M31-C: debounced content-mode search. Tracking a sequence number lets
  // older in-flight requests get dropped — without that, fast typing can
  // surface stale results (slow earlier query lands AFTER the latest one).
  useEffect(() => {
    if (searchMode !== 'content') {
      setContentHits(null);
      setSearching(false);
      return;
    }
    const q = query.trim();
    if (!q) {
      setContentHits(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeqRef.current;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/conversations/search?q=${encodeURIComponent(q)}&limit=50`,
          { cache: 'no-store' },
        );
        const j = (await r.json()) as {
          success: boolean;
          data?: { items?: ContentSearchHit[] };
        };
        if (seq !== searchSeqRef.current) return;
        setContentHits(j.success ? j.data?.items ?? [] : []);
      } catch {
        if (seq === searchSeqRef.current) setContentHits([]);
      } finally {
        if (seq === searchSeqRef.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchMode, query]);

  async function rename(id: string, title: string) {
    setEditingId(null);
    if (!title.trim()) return;
    await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    notifyConversationsChanged();
    void load();
  }

  async function setPinned(id: string, pinned: boolean) {
    await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned }),
    });
    notifyConversationsChanged();
    void load();
    toast.success(pinned ? tList('pin') : tList('unpin'));
  }

  async function archive(id: string) {
    await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });
    notifyConversationsChanged();
    void load();
    toast.success(tList('archived'));
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: tList('deleteConfirmTitle'),
      description: tList('deleteConfirm'),
      confirmLabel: tList('delete'),
      cancelLabel: tCommon('cancel'),
      variant: 'destructive',
    });
    if (!ok) return;
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    notifyConversationsChanged();
    void load();
    toast.success(tList('deleted'));
  }

  const tSearch = useTranslations('history.search');
  const tShare = useTranslations('history.share');
  // Count shown next to the title:
  //   - content + 有搜索词: contentHits 命中数
  //   - 否则 (title 模式 / content 无搜索词): 完整列表 length
  const showCount =
    searchMode === 'content' && query.trim()
      ? contentHits?.length ?? 0
      : filtered?.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {items === null
              ? tCommon('loading')
              : searching
                ? tSearch('searching')
                : t('count', { n: showCount })}
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              searchMode === 'content'
                ? tSearch('contentPlaceholder')
                : t('searchPlaceholder')
            }
            className="w-full rounded-md border border-border bg-background py-2 pl-8 pr-4 text-[13px] text-foreground placeholder:text-muted-foreground/50 outline-none transition-all focus:border-foreground/30"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* 搜索模式切换 */}
          <div className="inline-flex rounded-md border border-border bg-background p-0.5">
            {(['title', 'content'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setSearchMode(m)}
                title={m === 'content' ? tSearch('modeContentHint') : undefined}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-[12px] font-medium transition-all duration-150',
                  searchMode === m
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m === 'content' ? <FileText className="h-3 w-3" /> : <Search className="h-3 w-3" />}
                {tSearch(m === 'title' ? 'modeTitle' : 'modeContent')}
              </button>
            ))}
          </div>
          {/* 置顶过滤 */}
          {!(searchMode === 'content' && query.trim()) &&
            (['all', 'pinned'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-all duration-150',
                  filter === f
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
                )}
              >
                {f === 'pinned' && <Pin className="h-3 w-3" />}
                {t(`filter.${f}`)}
              </button>
            ))}
        </div>
      </div>

      {/* 列表区域 */}
      {searchMode === 'content' && query.trim() ? (
        <ContentResults
          query={query}
          hits={contentHits}
          searching={searching}
          tSearch={tSearch}
          tHistory={t}
          tCommon={tCommon}
        />
      ) : items === null ? (
        <div className="space-y-px">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-3">
              <div className="h-8 w-8 animate-pulse rounded-lg bg-muted" />
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="h-3.5 w-48 animate-pulse rounded bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted/60" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered && filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
          <Search className="h-6 w-6 text-muted-foreground/30" />
          <p className="text-[13px] text-muted-foreground">
            {query.trim() ? t('emptySearch') : t('empty')}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-background overflow-hidden">
          {filtered!.map((c) => {
            const editing = editingId === c.id;
            return (
              <li
                key={c.id}
                className="group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-accent sm:px-4"
              >
                {/* Model icon */}
                <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background sm:flex">
                  <VendorMonogram model={c.model || ''} size={20} />
                </div>

                {/* Title + meta */}
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <input
                      autoFocus
                      defaultValue={editingTitle}
                      onBlur={(e) => rename(c.id, e.currentTarget.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') rename(c.id, e.currentTarget.value);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="w-full rounded bg-accent px-1 text-[13px] outline-none ring-1 ring-foreground/20"
                    />
                  ) : (
                    <Link
                      href={`/c/${c.id}` as never}
                      className="flex items-center gap-1.5 truncate text-[13px] font-medium text-foreground hover:underline"
                      title={c.title}
                    >
                      <span className="truncate">{c.title}</span>
                      {c.pinned && (
                        <Pin className="h-3 w-3 shrink-0 text-muted-foreground" />
                      )}
                    </Link>
                  )}
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    {c.model && (
                      <span className="max-w-[120px] truncate rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                        {c.model}
                      </span>
                    )}
                    <time dateTime={c.updatedAt}>{formatRelative(c.updatedAt, t)}</time>
                  </div>
                </div>

                {/* Actions */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-100 transition-all hover:bg-accent hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 data-[state=open]:opacity-100"
                      aria-label={tList('actionsMenu')}
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => { setEditingTitle(c.title); setEditingId(c.id); }}>
                      <Pencil className="h-3.5 w-3.5" /> {tList('rename')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void setPinned(c.id, !c.pinned)}>
                      {c.pinned
                        ? <><PinOff className="h-3.5 w-3.5" /> {tList('unpin')}</>
                        : <><Pin className="h-3.5 w-3.5" /> {tList('pin')}</>
                      }
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void exportConversation(c)}>
                      <Download className="h-3.5 w-3.5" /> {tExport('menu')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setShareConv(c)}>
                      <Share2 className="h-3.5 w-3.5" /> {tShare('menu')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void archive(c.id)}>
                      <Archive className="h-3.5 w-3.5" /> {tList('archive')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => void remove(c.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {tList('delete')}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}
      <ShareModal
        conversationId={shareConv?.id ?? null}
        conversationTitle={shareConv?.title ?? ''}
        open={!!shareConv}
        onOpenChange={(next) => {
          if (!next) setShareConv(null);
        }}
      />
    </div>
  );
}

type Translator = (key: string, vars?: Record<string, string | number>) => string;

function ContentResults({
  query,
  hits,
  searching,
  tSearch,
  tHistory,
  tCommon,
}: {
  query: string;
  hits: ContentSearchHit[] | null;
  searching: boolean;
  tSearch: Translator;
  tHistory: Translator;
  tCommon: Translator;
}) {
  const trimmed = query.trim();
  if (!trimmed) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
        <FileText className="h-6 w-6 text-muted-foreground/30" />
        <p className="text-[13px] text-muted-foreground">{tSearch('modeContentHint')}</p>
      </div>
    );
  }
  if (searching && hits === null) {
    return (
      <div className="space-y-px">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5 rounded-lg px-3 py-3">
            <div className="h-3.5 w-56 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted/60" />
          </div>
        ))}
      </div>
    );
  }
  if (!hits || hits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-20 text-center">
        <Search className="h-6 w-6 text-muted-foreground/30" />
        <p className="text-[13px] text-muted-foreground">{tHistory('emptySearch')}</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-background overflow-hidden">
      {hits.map((h) => {
        const href = h.matchedMessageId
          ? `/c/${h.convId}#m${h.matchedMessageId}`
          : `/c/${h.convId}`;
        const matchLabel =
          h.matchKind === 'both'
            ? tSearch('matchInBoth')
            : h.matchKind === 'content'
              ? tSearch('matchInContent')
              : tSearch('matchInTitle');
        return (
          <li
            key={`${h.convId}:${h.matchedMessageId ?? 'title'}`}
            className="px-3 py-3 transition-colors hover:bg-accent sm:px-4"
          >
            <Link
              href={href as never}
              className="block focus:outline-none"
              title={tSearch('openMatch')}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-[13px] font-medium hover:underline">
                  {highlightTerm(h.title, query)}
                </span>
                <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {matchLabel}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
                {highlightTerm(h.snippet, query)}
              </p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                {h.model && <span className="truncate">{h.model}</span>}
                {h.model && <span aria-hidden="true">·</span>}
                <time dateTime={h.updatedAt}>
                  {formatRelative(h.updatedAt, tHistory)}
                </time>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Inline highlight for the matched query term — splits on the first
 * case-insensitive match and wraps it in a <mark>. Single match per cell
 * is enough for the snippet (which is already centered on it).
 */
function highlightTerm(text: string, term: string): React.ReactNode {
  const t = term.trim();
  if (!t || !text) return text;
  const idx = text.toLowerCase().indexOf(t.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-canvas-soft px-0.5 text-foreground">
        {text.slice(idx, idx + t.length)}
      </mark>
      {text.slice(idx + t.length)}
    </>
  );
}

/**
 * Lightweight relative time — avoids pulling in date-fns just for this.
 * Falls back to ISO date once over 30 days old.
 */
function formatRelative(iso: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return t('rel.now');
  const min = Math.floor(ms / 60_000);
  if (min < 60) return t('rel.minutesAgo', { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('rel.hoursAgo', { n: hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return t('rel.daysAgo', { n: day });
  return iso.slice(0, 10);
}
