'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage, VideoTask, AudioReply } from '@/hooks/use-chat-stream';
import { MarkdownContent } from '@/components/chat/MarkdownContent';
import { MessageActions } from '@/components/chat/MessageActions';
import { CollaborationDetails } from '@/components/chat/CollaborationDetails';
import { UsageBadge } from '@/components/chat/UsageBadge';
import { VideoCard } from '@/components/chat/VideoCard';
import { Button } from '@/components/ui/button';
import { Lightbox } from '@/components/ui/Lightbox';

export type MessageListProps = {
  messages: ChatMessage[];
  isStreaming: boolean;
  /** M17-P1b: needed for the sibling-switcher endpoint URL. Optional —
   *  ephemeral chats (no conv yet) won't render switchers. */
  conversationId?: string;
  onRegenerate?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  onEdit?: (messageId: string, newText: string) => void;
  /** M27: VideoCard polls and reports new VideoTask snapshots up here so
   *  the parent can keep `messages[]` in sync (otherwise re-renders /
   *  remounts would lose progress). */
  onVideoTaskChange?: (messageId: string, next: VideoTask) => void;
};

export function MessageList({
  messages,
  isStreaming,
  conversationId,
  onRegenerate,
  onDelete,
  onEdit,
  onVideoTaskChange,
}: MessageListProps) {
  const t = useTranslations('chat.message');
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stickToBottom, setStickToBottom] = useState(true);
  /** Lifted from MessageBubble so a single Lightbox covers the whole list
   *  — multiple bubbles fighting for their own modal would be silly. */
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  /** Set while a /branch POST is in flight so the user doesn't double-click
   *  ←/→ before the page refetches. Per-message-db-id to avoid disabling
   *  every switcher when one is loading. */
  const [switching, setSwitching] = useState<number | null>(null);

  async function switchBranch(targetId: number) {
    if (!conversationId || switching !== null) return;
    setSwitching(targetId);
    try {
      const r = await fetch(`/api/conversations/${conversationId}/branch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headMessageId: targetId }),
      });
      if (r.ok) {
        // Re-fetch the page so initialMessages reflects the new HEAD.
        router.refresh();
      }
    } finally {
      setSwitching(null);
    }
  }

  // Track whether the user has scrolled up. We treat "within 80px of the
  // bottom" as "still pinned" — small gestures don't break the auto-scroll.
  useEffect(() => {
    const el = containerRef.current?.parentElement; // the scrollable container
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setStickToBottom(distance < 80);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Auto-scroll only while we're pinned to the bottom — preserves the
  // user's position when they've scrolled up to read earlier turns.
  useEffect(() => {
    if (!stickToBottom) return;
    bottomRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
  }, [messages, isStreaming, stickToBottom]);

  // M31-C: deep-link to a specific message via `#m{id}` (search result
  // → /c/{id}#m{matchedMessageId}). Mount-only: find the bubble, scroll
  // it into view, and disable stickToBottom so the auto-scroll above
  // doesn't immediately fling us back. A one-shot ring highlight makes
  // the target obvious in a long transcript.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!/^#m\d+$/.test(hash)) return;
    const id = hash.slice(1);
    setStickToBottom(false);
    requestAnimationFrame(() => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: 'auto', block: 'center' });
      el.classList.add('ring-2', 'ring-ink/30', 'rounded-md');
      setTimeout(() => {
        el.classList.remove('ring-2', 'ring-ink/30', 'rounded-md');
      }, 2000);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={containerRef} className="relative mx-auto w-full max-w-3xl space-y-8 px-3 py-4 sm:px-6 sm:py-6">
      {!stickToBottom && (
        <button
          type="button"
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="sticky bottom-3 left-1/2 z-10 -translate-x-1/2 inline-flex h-8 w-8 -translate-y-2 items-center justify-center rounded-full border bg-card text-muted-foreground shadow-md hover:text-foreground"
          aria-label={t('scrollToBottom')}
          style={{ float: 'right' }}
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}
      {messages.map((m) => (
        <MessageBubble
          key={m.id}
          message={m}
          streaming={
            isStreaming && m === messages[messages.length - 1] && m.role === 'assistant'
          }
          onRegenerate={onRegenerate}
          onDelete={onDelete}
          onEdit={onEdit}
          actionsDisabled={isStreaming}
          onZoom={setZoomSrc}
          onSwitchBranch={switchBranch}
          switching={switching}
          onVideoTaskChange={onVideoTaskChange}
        />
      ))}
      <div ref={bottomRef} />
      {zoomSrc && <Lightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />}
    </div>
  );
}

function MessageBubble({
  message,
  streaming,
  onRegenerate,
  onDelete,
  onEdit,
  actionsDisabled,
  onZoom,
  onSwitchBranch,
  switching,
  onVideoTaskChange,
}: {
  message: ChatMessage;
  streaming: boolean;
  onRegenerate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (id: string, text: string) => void;
  actionsDisabled?: boolean;
  /** Open the full-screen Lightbox for an image. Lifted into MessageList
   *  so the modal sits at the list root (single instance, no z-index war). */
  onZoom?: (src: string) => void;
  /** M17-P1b: switch this row to a sibling branch. */
  onSwitchBranch?: (targetMessageId: number) => void;
  /** id currently being switched (disables both arrows of every bubble
   *  while in flight to keep UI consistent during the refetch). */
  switching?: number | null;
  onVideoTaskChange?: (messageId: string, next: VideoTask) => void;
}) {
  const t = useTranslations('chat.message');
  const isUser = message.role === 'user';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  // Sibling pill is rendered above each bubble that has alternatives.
  const showSiblings =
    !!onSwitchBranch &&
    typeof message.siblingCount === 'number' &&
    message.siblingCount > 1 &&
    Array.isArray(message.siblingIds) &&
    typeof message.siblingIndex === 'number';
  const siblingPrev =
    showSiblings && message.siblingIndex! > 0
      ? message.siblingIds![message.siblingIndex! - 1]
      : null;
  const siblingNext =
    showSiblings && message.siblingIndex! < message.siblingCount! - 1
      ? message.siblingIds![message.siblingIndex! + 1]
      : null;
  return (
    <div
      id={`m${message.id}`}
      className={cn(
        'group flex scroll-mt-20 flex-col gap-1',
        isUser ? 'items-end' : 'items-start',
      )}
    >
      {showSiblings && (
        <div
          className={cn(
            'flex items-center gap-0.5 text-[11px] text-muted-foreground',
            isUser ? 'self-end' : 'self-start',
          )}
        >
          <button
            type="button"
            onClick={() => siblingPrev !== null && onSwitchBranch?.(siblingPrev)}
            disabled={siblingPrev === null || switching !== null}
            aria-label={t('siblingPrev')}
            className="inline-flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
          <span className="font-mono">
            {(message.siblingIndex ?? 0) + 1}/{message.siblingCount}
          </span>
          <button
            type="button"
            onClick={() => siblingNext !== null && onSwitchBranch?.(siblingNext)}
            disabled={siblingNext === null || switching !== null}
            aria-label={t('siblingNext')}
            className="inline-flex h-5 w-5 items-center justify-center rounded transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
      <div className={cn('flex w-full gap-3', isUser ? 'justify-end' : 'justify-start')}>
        <div
          className={cn(
            'text-sm leading-relaxed',
            isUser
              ? 'max-w-[70%] rounded-md bg-gradient-to-br from-muted to-muted/60 px-4 py-3 text-foreground shadow-[var(--shadow-soft)]'
              : 'w-full max-w-none px-1',
          )}
        >
          {(message.reasoning || (streaming && !message.content)) && (
            <ReasoningBlock
              reasoning={message.reasoning}
              streaming={streaming}
              hasContent={!!message.content}
            />
          )}
          {message.documents && message.documents.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {message.documents.map((d) => (
                <a
                  key={d.id}
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-[260px] items-center gap-2 rounded-lg border bg-background/60 px-2.5 py-1.5 text-xs hover:bg-accent"
                  title={d.name}
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex flex-col leading-tight overflow-hidden">
                    <span className="truncate font-medium">{d.name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {Math.max(1, Math.round(d.sizeBytes / 1024))} KB
                    </span>
                  </span>
                </a>
              ))}
            </div>
          )}
          {message.attachments && message.attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {message.attachments.map((a) => {
                const src = `data:${a.mime};base64,${a.b64}`;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => onZoom?.(src)}
                    className="block overflow-hidden rounded-lg"
                    aria-label={a.name}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt={a.name}
                      className="h-32 w-32 object-cover transition-transform hover:scale-[1.02]"
                    />
                  </button>
                );
              })}
            </div>
          )}
          {message.generatedImages && message.generatedImages.length > 0 && (
            <div className="mb-2 flex flex-col gap-2">
              {message.generatedImages.map((img, i) => (
                <button
                  key={`${img.url}-${i}`}
                  type="button"
                  onClick={() => onZoom?.(img.url)}
                  className="group block overflow-hidden rounded-md bg-muted/40"
                  aria-label={img.prompt ?? t('viewImage')}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.prompt ?? ''}
                    className="max-h-[480px] w-full rounded-md object-contain transition-opacity group-hover:opacity-95"
                  />
                </button>
              ))}
            </div>
          )}
          {message.videoTask && (
            <VideoCard
              task={message.videoTask}
              onChange={(next) => onVideoTaskChange?.(message.id, next)}
            />
          )}
          {message.imageGenerating && (
            <ImageGeneratingPlaceholder
              startedAt={message.imageGenerating.startedAt}
              model={message.imageGenerating.model}
            />
          )}
          {message.audioReply && <AudioReplyCard reply={message.audioReply} />}
          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={Math.min(8, Math.max(2, draft.split('\n').length))}
                className="w-full resize-none rounded-lg border bg-background p-2 text-sm text-foreground"
              />
              <div className="flex justify-end gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setDraft(message.content);
                  }}
                >
                  {t('cancelEdit')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(false);
                    if (draft.trim() && draft !== message.content) {
                      onEdit?.(message.id, draft);
                    }
                  }}
                  disabled={!draft.trim() || draft === message.content}
                >
                  {t('sendEdit')}
                </Button>
              </div>
            </div>
          ) : (
            <div className={cn('break-words', isUser && 'whitespace-pre-wrap')}>
              {/* User messages render as plain text — no risk of accidental
                  markdown injection from prompts. Assistant messages render
                  the model's GFM markdown output. */}
              {message.content
                ? isUser
                  ? message.content
                  : <MarkdownContent content={message.content} onZoomImage={onZoom} />
                : streaming && !message.reasoning
                  ? <TypingDots />
                  : null}
              {message.collaborationDetails && message.collaborationDetails.length > 0 && (
                <CollaborationDetails details={message.collaborationDetails} />
              )}
            </div>
          )}
        </div>
      </div>
      {!editing && !streaming && (onDelete || onRegenerate || onEdit) && (
        // M35 fix: shrink-to-content so action buttons hug the bubble's
        // edge instead of stretching to max-w-[70%] of the column. Short
        // user messages ("hi") used to leave a big gap because the
        // wrapper occupied the full 70%-wide row.
        <div className={cn('inline-flex', isUser ? 'self-end' : 'self-start')}>
          <MessageActions
            role={isUser ? 'user' : 'assistant'}
            text={message.content}
            onCopy={() => {}}
            onRegenerate={
              !isUser && onRegenerate ? () => onRegenerate(message.id) : undefined
            }
            onEdit={
              isUser && onEdit
                ? () => {
                    setDraft(message.content);
                    setEditing(true);
                  }
                : undefined
            }
            onDelete={() => onDelete?.(message.id)}
            disabled={actionsDisabled}
            align={isUser ? 'right' : 'left'}
          />
        </div>
      )}
      {/* M24: cost badge under assistant bubbles. Renders only when SSE
       *  delivered the usage frame (or it was hydrated from the DB). */}
      {!editing && !streaming && !isUser && message.usage && (
        <div className="self-start">
          <UsageBadge usage={message.usage} />
        </div>
      )}
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
    </span>
  );
}

/**
 * Renders the reasoning summary block with a live elapsed-seconds badge
 * while the model is still thinking. Two reasons we surface elapsed time:
 *
 *   1) Some Azure deployments don't emit `reasoning_summary_text.delta`
 *      events at all, so the user sees nothing for a minute. The badge
 *      proves the request is alive.
 *   2) Even when we *do* get a reasoning stream, the user wants to know
 *      how long they've waited so far — `use_time` from new-api comes
 *      back upstream-measured and undercounts reasoning latency.
 *
 * Auto-opens while streaming so reasoning text is visible as it lands;
 * collapses once content has arrived (the answer is what they care about).
 */
function ReasoningBlock({
  reasoning,
  streaming,
  hasContent,
}: {
  reasoning: string | undefined;
  streaming: boolean;
  hasContent: boolean;
}) {
  const t = useTranslations('chat.message');
  const elapsedSec = useElapsedSeconds(streaming && !hasContent);
  const open = streaming && !hasContent;
  return (
    <details
      className="mb-2 text-xs text-muted-foreground"
      open={open}
    >
      <summary className="inline-flex cursor-pointer select-none items-center gap-2">
        <span>{t('reasoning')}</span>
        {streaming && !hasContent && (
          <span className="font-mono text-[11px] text-muted-foreground/80">
            {t('thinkingElapsed', { sec: elapsedSec })}
          </span>
        )}
      </summary>
      {reasoning ? (
        <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-snug">
          {reasoning}
        </pre>
      ) : (
        streaming && !hasContent && (
          <p className="mt-2 text-[11px] italic text-muted-foreground/80">
            {t('thinkingNoStream')}
          </p>
        )
      )}
    </details>
  );
}

/**
 * M42-S1 follow-up · chat 流 image-native (gpt-image-2) 生成中占位.
 *
 * gpt-image-2 high quality + 2K/4K 单张普遍 2-3min, 之前 UI 只显示一行
 * "生成中…" 用户以为卡死. 这里加 spinner + 实时秒表 + 文案提示, 避免
 * 用户切走 / 重发.
 *
 * `startedAt` 来自 message.imageGenerating, 不从 mount 计时 — 这样
 * 父 setMessages re-render 不会重置秒数 (StrictMode 双 effect 下也稳).
 */
function ImageGeneratingPlaceholder({
  startedAt,
  model,
}: {
  startedAt: number;
  model: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);
  const elapsedSec = Math.max(0, Math.floor((now - startedAt) / 1000));
  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');
  const isGptImage2 = model === 'gpt-image-2';
  return (
    <div className="mb-2 flex items-start gap-3 rounded-md border border-border bg-muted/30 px-4 py-3">
      <div className="relative mt-0.5 h-5 w-5 shrink-0">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
        <span className="absolute inset-1 rounded-full bg-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-foreground">正在生成图片</span>
          <span className="font-mono text-xs tabular-nums text-muted-foreground">
            已等待 {mm}:{ss}
          </span>
        </div>
        {isGptImage2 && (
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            gpt-image-2 普遍需要 2-3 分钟，请在此页面耐心等待，不要切走或刷新。
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Tick-every-500ms elapsed-seconds counter scoped to the lifetime of an
 * `active=true` window. Resets on each rising edge so a new send starts
 * back at 0 even if the bubble component instance is reused.
 */
function useElapsedSeconds(active: boolean): number {
  const [sec, setSec] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!active) {
      startedAtRef.current = null;
      setSec(0);
      return;
    }
    startedAtRef.current = Date.now();
    setSec(0);
    const id = window.setInterval(() => {
      if (startedAtRef.current === null) return;
      setSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 500);
    return () => window.clearInterval(id);
  }, [active]);
  return sec;
}

/**
 * M29-I: inline audio player + download for TTS replies. Mirrors the
 * lightweight VideoCard styling but skips the polling — audio is fully
 * synthesised by the time it lands here. Blob URL is owned by the
 * parent message; revoking happens implicitly when the React tree
 * unmounts (the URL.createObjectURL pool is GC'd with the page).
 */
function AudioReplyCard({ reply }: { reply: AudioReply }) {
  async function handleDownload() {
    try {
      const res = await fetch(reply.url);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `chat-audio-${ts}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      /* ignore */
    }
  }
  return (
    <div className="my-2 flex flex-col gap-1.5 rounded-md border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>🔊 {reply.voice}</span>
        <button
          type="button"
          onClick={handleDownload}
          className="ml-auto inline-flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs hover:bg-accent"
        >
          下载
        </button>
      </div>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio src={reply.url} controls preload="metadata" className="w-full" />
    </div>
  );
}
