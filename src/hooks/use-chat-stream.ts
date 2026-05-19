'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Conversation message — same shape as OpenAI's chat-completion `messages`
 * entries plus an optional client-side `id`, `reasoning` (for o1/GPT-5
 * thinking models), and `attachments` (image uploads attached to a user
 * turn). Attachments live separately from `content` so the bubble can
 * render them as a strip below the text without us re-parsing multimodal
 * arrays for display.
 */
export type ChatAttachment = {
  id: string;
  /** mime type, e.g. "image/png" */
  mime: string;
  /** Plain base64 (no data: prefix). */
  b64: string;
  /** Original filename if user picked one; falls back to "image". */
  name: string;
};

/** M17-P2: a reference document (PDF/DOCX/TXT/MD) the user attached.
 *  Already uploaded via /api/conversations/:id/documents — by the time
 *  it lands here we have the URL + extracted text from the server. */
export type ChatDocument = {
  /** Client-side React key — `${docId}` is fine. */
  id: string;
  /** Opaque server-side id used in the storage path + URL. */
  docId: string;
  name: string;
  mime: string;
  url: string;
  sizeBytes: number;
  truncated?: boolean;
  /** Server-extracted text — already truncated to MAX_DOC_CHARS. */
  extractedText: string;
};

/** Image produced by the assistant via the built-in image_generation tool.
 *  The URL points at our BFF proxy (/api/files/images/...), not the raw
 *  filesystem — so cookies + uid validation gate access. M16. */
export type GeneratedImage = {
  url: string;
  prompt?: string;
  size?: string;
  quality?: string;
};

/** M24: per-turn token accounting. Captured from the SSE stream's final
 *  usage frame (or backfilled from the DB when hydrating old messages),
 *  drives the cost badge on assistant bubbles. The model name lives here
 *  rather than on `ChatMessage` directly because it's the *resolved*
 *  upstream model — the user-selected model can differ when new-api
 *  remaps via channel `model_mapping`. */
export type UsageInfo = {
  promptTokens: number;
  completionTokens: number;
  model: string;
};

/** M31-A: per-collaborator detail attached to an assistant turn that ran
 *  through the multi-model orchestrator. The bubble's primary text is
 *  the reducer-merged answer; this array drives the collapsed "show N
 *  original answers" panel below it. */
export type CollaborationDetail = {
  model: string;
  content: string;
  promptTokens?: number;
  completionTokens?: number;
  durationMs?: number;
  /** Set on a failed branch — UI shows a red "X failed" chip. */
  error?: string;
};

/** M29-I: TTS reply attached to an assistant message. In-memory only —
 *  V1 does not persist audio replies to conv history. The url is a
 *  blob URL produced from the /api/audio/speech mp3 stream; gets
 *  revoked when the bubble unmounts. */
export type AudioReply = {
  voice: string;
  /** blob: URL holding the synthesised mp3 bytes. */
  url: string;
  /** Original prompt — shown in download filename if needed. */
  text: string;
};

/** M27: Veo video-task envelope persisted onto an assistant message's
 *  `content.videoTask`. The bubble owns the polling state — the hook
 *  `useVideoTask` updates this when the upstream task transitions, and
 *  MessageList renders the right card variant (queued / running /
 *  completed / failed). The MP4 itself is NOT stored here — the URL
 *  points at our BFF `/api/files/videos/{taskId}` which streams from
 *  new-api on demand. */
export type VideoTask = {
  taskId: string;
  model: string;
  prompt: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress?: number; // 0–100
  /** /api/files/videos/{taskId} once the task has completed. */
  videoUrl?: string;
  errorMessage?: string;
  submittedAt: number; // unix ms
  completedAt?: number;
  durationSeconds?: number;
};

export type ChatMessage = {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  reasoning?: string;
  attachments?: ChatAttachment[];
  /** M17-P2: doc references attached to a user turn. Hydration-only on
   *  resume; new turns push these via SendOpts.documents. */
  documents?: ChatDocument[];
  generatedImages?: GeneratedImage[];
  /** M17-P1b: db row id when hydrated from server. Absent on freshly
   *  streamed messages until the next GET — that's fine, the
   *  sibling-switcher is only meaningful on persisted rows anyway. */
  dbId?: number;
  /** Number of branches sharing this message's parent (>1 ⇒ render
   *  the ←/→ switcher). 1 or undefined hides it. */
  siblingCount?: number;
  /** 0-based position within those siblings, sorted by id. */
  siblingIndex?: number;
  /** Sibling ids, sorted by id ASC. Lets the switcher pick the
   *  prev/next branch without a round-trip. */
  siblingIds?: number[];
  /** M24: prompt/completion token counts + resolved upstream model
   *  name. Populated when SSE delivers its final usage frame for new
   *  turns, or when conv-svc returns historical messages. Drives the
   *  cost badge in MessageList. */
  usage?: UsageInfo;
  /** M27: Veo video task. Set on assistant turns whose upstream model
   *  was a veo-*; mutated by useVideoTask as the task progresses. */
  videoTask?: VideoTask;
  /** M29-I: TTS audio attached to assistant turns from gpt-4o-mini-tts.
   *  In-memory only (blob URL); reload loses it. */
  audioReply?: AudioReply;
  /** M31-A: per-model details when this turn ran through the multi-model
   *  orchestrator (reducer-merged primary text + N originals). */
  collaborationDetails?: CollaborationDetail[];
  /** M42-S1 follow-up: chat 流 image-native 模型生成中占位 (gpt-image-2
   *  high quality / 4K 单张要 2-3min). MessageList 检测到这字段就渲染
   *  ImageGeneratingPlaceholder 带计时 + 文案, 不显示空气泡. transient
   *  client-only — 不上 server, 完成后 setMessages 删掉这字段并把
   *  generatedImages / content 填上. */
  imageGenerating?: {
    startedAt: number;
    model: string;
  };
};

type SendOpts = {
  model: string;
  /** When set, persisted to conv-svc; otherwise the chat is in-memory only. */
  conversationId?: string;
  /** Extra body fields (temperature, top_p, etc.) merged into the request. */
  extra?: Record<string, unknown>;
  /** Optional image attachments — sent as OpenAI multimodal content parts. */
  attachments?: ChatAttachment[];
  /** M17-P2: pre-uploaded reference documents. The conv-svc inlines
   *  their extractedText into the user turn upstream. */
  documents?: ChatDocument[];
};

/**
 * Lightweight streaming-chat hook. No external SDK dependency — we parse
 * OpenAI SSE chunks directly because:
 *   1. our /api/chat BFF pipes raw OpenAI SSE,
 *   2. M4 will redirect the same client through conversation-service,
 *      which we control, so the wire format stays under our control.
 *
 * Returns:
 *   messages       — current transcript
 *   send(text)     — append a user message and stream the assistant reply
 *   stop()         — abort the in-flight stream (assistant message kept)
 *   isStreaming    — true while a reply is being received
 *   error          — last failure message, cleared on next send()
 */
export function useChatStream(initial: ChatMessage[] = []) {
  const tErrors = useTranslations('chat.errors');
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // M32-2.A: deadline (ms epoch) at which the user can retry after a 429.
  // Set by parsing the Retry-After header on rate-limited responses; null
  // when no active rate limit. Composer reads this to disable the send
  // button + show a countdown.
  const [retryAfterDeadline, setRetryAfterDeadline] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Active text-chunk throttler for the in-flight stream. Stop() cancels
  // it so the remaining queue is dropped instead of trickling out after
  // the user clicks Stop. New sends cancel any leftover throttler too.
  const throttlerRef = useRef<Throttler | null>(null);

  /**
   * Translate raw upstream errors into localised hints when the failure mode is
   * a known feature/model mismatch. Falls back to the original message so we
   * don't accidentally hide useful diagnostics. Defined inside the hook so it
   * can capture the i18n `t` function.
   */
  const translateErrorMessage = useCallback(
    (raw: string): string => {
      const m = raw.toLowerCase();
      if (m.includes('unsupported tool type') || m.includes('tool type')) {
        return tErrors('unsupportedSearch');
      }
      if (m.includes('unsupported') && m.includes('reasoning')) {
        return tErrors('unsupportedReasoning');
      }
      if (m.includes('quota') && (m.includes('exceed') || m.includes('insufficient'))) {
        return tErrors('quotaExhaustedHint');
      }
      if (m.includes('rate limit') || raw.includes('429')) {
        return tErrors('rateLimitHint');
      }
      if (m.includes('no available channel') || m.includes('model_not_found')) {
        return tErrors('noChannel');
      }
      return raw;
    },
    [tErrors],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    throttlerRef.current?.cancel();
    throttlerRef.current = null;
    setIsStreaming(false);
  }, []);

  // M32-2.A: useCallback deps include retryAfterDeadline so the hook re-creates
  // when the deadline changes (UI relies on the callback identity for memoisation).
  const send = useCallback(
    async (text: string, opts: SendOpts) => {
      if (!text.trim()) return;
      setError(null);
      // M32-2.A: a fresh send attempt clears any prior rate-limit deadline.
      // The composer is supposed to gate this with `Date.now() < deadline`,
      // but we belt-and-suspenders the state here too.
      setRetryAfterDeadline(null);

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text,
        ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
        ...(opts.documents?.length ? { documents: opts.documents } : {}),
      };
      const asstMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
      };

      // Snapshot the request body BEFORE we mutate state so concurrent
      // setMessages calls don't race the upstream payload. For messages
      // with image attachments, build OpenAI's multimodal `content` array;
      // text-only messages send the plain string (saves bytes + matches
      // what most providers expect for non-multimodal turns).
      const requestMessages = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: buildMultimodalContent(m),
      }));

      setMessages((prev) => [...prev, userMsg, asstMsg]);
      setIsStreaming(true);

      const ctl = new AbortController();
      abortRef.current = ctl;

      // Drop any throttler from a prior in-flight send (rare — UI usually
      // gates concurrent sends — but a stray Stop + Send race could leave
      // one ticking).
      throttlerRef.current?.cancel();
      // The throttler smooths bursty deltas (e.g. a 200-char chunk landing
      // all at once on reasoning=high) into a typewriter feel. Each tick
      // applies one slice via setMessages; React batches the asst-msg
      // append into a single render per tick. Canceled / drained per send.
      const throttler = makeThrottler((kind, text) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== asstMsg.id) return m;
            if (kind === 'content') return { ...m, content: m.content + text };
            return { ...m, reasoning: ((m.reasoning ?? '') + text) || undefined };
          }),
        );
      });
      throttlerRef.current = throttler;

      try {
        // Persisted mode → conv-svc owns the transcript; we only send the
        // newest user turn (server already has the rest).
        // In-memory mode → /api/chat passes the full transcript.
        const persistedMode = !!opts.conversationId;
        const url = persistedMode
          ? `/api/conversations/${opts.conversationId}/messages`
          : '/api/chat';
        const reqBody = persistedMode
          ? {
              content: opts.attachments?.length
                ? buildMultimodalContent(userMsg)
                : text,
              model: opts.model,
              extra: opts.extra,
              // M17-P2: pass document descriptors so conv-svc inlines
              // their extracted text into the upstream prompt and
              // persists references to the message row.
              ...(opts.documents?.length
                ? {
                    documents: opts.documents.map((d) => ({
                      docId: d.docId,
                      name: d.name,
                      mime: d.mime,
                      sizeBytes: d.sizeBytes,
                      truncated: d.truncated,
                      kind: d.mime.includes('pdf')
                        ? 'pdf'
                        : d.mime.includes('wordprocessingml')
                          ? 'docx'
                          : d.mime.includes('markdown')
                            ? 'markdown'
                            : 'text',
                      url: d.url,
                      extractedText: d.extractedText,
                    })),
                  }
                : {}),
            }
          : {
              model: opts.model,
              messages: requestMessages,
              ...opts.extra,
            };

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody),
          signal: ctl.signal,
        });

        if (!res.ok || !res.body) {
          // M32-2.A: 429 with Retry-After → set a retry deadline so the
          // composer can disable Send + show "Xs 后可重试" countdown.
          // Other 4xx/5xx fall through to the regular error toast path.
          if (res.status === 429) {
            const ra = res.headers.get('retry-after');
            const seconds = ra ? parseRetryAfter(ra) : null;
            if (seconds !== null && seconds > 0) {
              setRetryAfterDeadline(Date.now() + seconds * 1000);
            }
          }
          // Try to read a JSON error envelope (BFF, upstream 4xx, …).
          let msg = `HTTP ${res.status}`;
          try {
            const j = await res.json();
            if (typeof j?.message === 'string') msg = j.message;
            else if (j?.error?.message) msg = j.error.message;
          } catch {
            /* keep default */
          }
          setError(translateErrorMessage(msg));
          // Drop the empty assistant placeholder on error.
          setMessages((prev) => prev.filter((m) => m.id !== asstMsg.id));
          return;
        }

        // M27: video task path — conv-svc returns a single JSON envelope
        // (kind:'video_task') instead of an SSE stream when the model is
        // veo-*. We don't iterate deltas; we just hydrate the placeholder
        // assistant bubble with the persisted videoTask and let
        // useVideoTask drive the polling.
        const ct = res.headers.get('content-type') ?? '';
        if (ct.includes('application/json')) {
          let envelope: {
            success?: boolean;
            message?: string;
            data?: {
              kind?: string;
              userMessage?: { id: number };
              assistantMessage?: {
                id: number;
                model?: string;
                content?: { videoTask?: VideoTask };
              };
            };
          };
          try {
            envelope = await res.json();
          } catch {
            setError(translateErrorMessage(`HTTP ${res.status}`));
            setMessages((prev) => prev.filter((m) => m.id !== asstMsg.id));
            return;
          }
          const videoTask = envelope.data?.assistantMessage?.content?.videoTask;
          if (!envelope.success || !envelope.data || !videoTask) {
            setError(translateErrorMessage(envelope.message || `HTTP ${res.status}`));
            setMessages((prev) => prev.filter((m) => m.id !== asstMsg.id));
            return;
          }
          const userDbId = envelope.data.userMessage?.id;
          const asstDbId = envelope.data.assistantMessage!.id;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === asstMsg.id) {
                return { ...m, dbId: asstDbId, videoTask };
              }
              if (m.id === userMsg.id && userDbId !== undefined) {
                return { ...m, dbId: userDbId };
              }
              return m;
            }),
          );
          return;
        }

        await consumeStream(res.body, (delta) => {
          // M24: usage arrives in its own (otherwise empty) frame at
          // end-of-stream — handle it before the early-exit so we don't
          // skip turns that finish without text deltas.
          if (delta.usage) {
            const u = delta.usage;
            setMessages((prev) =>
              prev.map((m) => (m.id === asstMsg.id ? { ...m, usage: u } : m)),
            );
          }
          // M31-A: per-model breakdown lands in its own frame after the
          // merged answer. Push onto the bubble; MessageList will render
          // a collapsed "show N original answers" panel below the text.
          if (delta.collaborationDetails) {
            const details = delta.collaborationDetails;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === asstMsg.id
                  ? { ...m, collaborationDetails: details }
                  : m,
              ),
            );
          }
          if (
            !delta.content &&
            !delta.reasoning &&
            !delta.imageUrl &&
            !delta.collaborationDetails
          )
            return;
          // Image deltas bypass the throttler and force-flush any queued
          // text first — otherwise the user sees the image appear before
          // the text the model wrote leading up to it.
          if (delta.imageUrl) {
            throttler.flushNowSync();
            const url = delta.imageUrl;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === asstMsg.id
                  ? { ...m, generatedImages: [...(m.generatedImages ?? []), { url }] }
                  : m,
              ),
            );
          }
          if (delta.content) throttler.push('content', delta.content);
          if (delta.reasoning) throttler.push('reasoning', delta.reasoning);
        });
        // Stream finished from upstream's side — let the typewriter
        // queue drain at its normal cadence before we mark the chat
        // idle. Without this wait, "Stop" goes false while the last
        // few characters are still trickling out, which looks broken.
        await throttler.waitForDrain();
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setError(translateErrorMessage(e instanceof Error ? e.message : 'network error'));
      } finally {
        if (abortRef.current === ctl) abortRef.current = null;
        // Already cancelled by stop() in the abort path; in the happy
        // path waitForDrain() above resolved with an empty queue. Either
        // way clear the ref so a stale handle doesn't survive into the
        // next send.
        if (throttlerRef.current === throttler) throttlerRef.current = null;
        setIsStreaming(false);
      }
    },
    [messages, translateErrorMessage],
  );

  return {
    messages,
    send,
    stop,
    isStreaming,
    error,
    setMessages,
    setError,
    // M32-2.A: ms-epoch deadline after which a rate-limited send can retry.
    // null when no active rate limit. Composer checks `Date.now() < deadline`
    // to decide whether to disable the send button + render countdown.
    retryAfterDeadline,
    setRetryAfterDeadline,
  };
}

/**
 * RFC 9110 `Retry-After` header parser. Two valid forms:
 *   1. delta-seconds (e.g. "120")
 *   2. HTTP-date (e.g. "Wed, 21 Oct 2026 07:28:00 GMT")
 * Returns seconds (clamped ≥0), or null if unparseable.
 */
function parseRetryAfter(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const asInt = Number(trimmed);
  if (Number.isFinite(asInt) && asInt >= 0) return Math.floor(asInt);
  const ts = Date.parse(trimmed);
  if (!Number.isNaN(ts)) {
    const seconds = Math.floor((ts - Date.now()) / 1000);
    return seconds >= 0 ? seconds : 0;
  }
  return null;
}

/**
 * Convert an in-memory ChatMessage to the wire-format `content` field.
 * Plain text → string. With attachments → OpenAI multimodal array
 * `[{type:"text",...}, {type:"image_url",image_url:{url:"data:..."}}, ...]`.
 *
 * GPT-5.x natively reads `image_url`. If the upstream model doesn't, the
 * server returns a structured error which our translator surfaces.
 */
function buildMultimodalContent(m: ChatMessage): string | unknown[] {
  if (!m.attachments?.length) return m.content;
  const parts: unknown[] = [];
  if (m.content) parts.push({ type: 'text', text: m.content });
  for (const a of m.attachments) {
    parts.push({
      type: 'image_url',
      image_url: { url: `data:${a.mime};base64,${a.b64}` },
    });
  }
  return parts;
}

/**
 * Read OpenAI-format SSE: text/event-stream where each event is
 *   data: {...json...}\n\n
 * with a terminal `data: [DONE]` sentinel. Returns when [DONE] arrives or
 * the stream closes.
 */
async function consumeStream(
  body: ReadableStream<Uint8Array>,
  onDelta: (delta: {
    content?: string;
    reasoning?: string;
    imageUrl?: string;
    /** M24: emitted exactly once per turn when SSE finishes — carries
     *  the upstream's final token counts and resolved model name. */
    usage?: UsageInfo;
    /** M31-A: emitted once per collaboration turn after the merged
     *  answer; lets MessageList render the per-model breakdown. */
    collaborationDetails?: CollaborationDetail[];
  }) => void,
): Promise<void> {
  // Inline base64 image extractor — gemini-3.x *-image-preview models
  // emit their PNG as `![alt](data:image/png;base64,...)` inside the
  // chat-completions content stream. Without intervention the
  // typewriter would render the ~1300-char base64 payload one char
  // at a time, looking like garbage to the user; the closing `)`
  // arrives only at the very end. We buffer pending content here,
  // strip out complete `![...](data:image/...;base64,...)` matches as
  // they close, hand them off as imageUrl events (same path M16's
  // built-in image_generation tool already uses), and only flush
  // text content that's NOT inside an unclosed image-markdown.
  let pending = '';
  function flushPending(): void {
    // Pull out every complete data: image-markdown match.
    const re = /!\[[^\]]*\]\((data:image\/[^)]+)\)/g;
    let last = 0;
    let safe = '';
    let m: RegExpExecArray | null;
    while ((m = re.exec(pending)) !== null) {
      safe += pending.slice(last, m.index);
      onDelta({ imageUrl: m[1]! });
      last = m.index + m[0].length;
    }
    safe += pending.slice(last);
    pending = safe;
    // Hold back text from the start of any UNCLOSED image-markdown
    // — its closing `)` may arrive in a later chunk.
    const openIdx = pending.search(/!\[[^\]]*\]\(data:image\//);
    if (openIdx >= 0 && pending.indexOf(')', openIdx) === -1) {
      const flushable = pending.slice(0, openIdx);
      pending = pending.slice(openIdx);
      if (flushable) onDelta({ content: flushable });
    } else if (pending.length > 0) {
      onDelta({ content: pending });
      pending = '';
    }
  }

  // Wraps the parent's onDelta so delta.content runs through the
  // image extractor first; reasoning / imageUrl / usage pass through.
  // The split forward keeps two invariants intact:
  //   - one inbound SSE frame ⇒ at least one outbound onDelta call
  //     (keepalive / empty frames still tick downstream consumers)
  //   - a content-only frame yields exactly one onDelta (whatever
  //     flushPending decides to emit), not an extra empty meta one
  function emit(delta: {
    content?: string;
    reasoning?: string;
    imageUrl?: string;
    usage?: UsageInfo;
    collaborationDetails?: CollaborationDetail[];
  }): void {
    const hadContent = delta.content !== undefined;
    if (hadContent) {
      pending += delta.content!;
      flushPending();
    }
    const hasMeta =
      delta.reasoning !== undefined ||
      delta.imageUrl !== undefined ||
      delta.usage !== undefined ||
      delta.collaborationDetails !== undefined;
    if (hasMeta || !hadContent) {
      onDelta({
        reasoning: delta.reasoning,
        imageUrl: delta.imageUrl,
        usage: delta.usage,
        collaborationDetails: delta.collaborationDetails,
      });
    }
  }

  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by blank line. Process all complete events.
    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      const event = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      handleEvent(event, emit);
      sep = buffer.indexOf('\n\n');
    }
  }
  // Drain trailing partial.
  if (buffer.trim()) handleEvent(buffer, emit);
  // Final flush — any pending content (e.g. text that arrived without
  // a trailing newline, or a malformed image-markdown that never
  // closed) has to land on screen one way or another.
  if (pending) {
    onDelta({ content: pending });
    pending = '';
  }
}

/**
 * Smooths bursty SSE text deltas into a typewriter-like cadence.
 *
 * Why we need this: providers like the OpenAI Responses API often send a
 * 200-char chunk after a long "reasoning" pause, then nothing. Without a
 * buffer, the user watches the spinner for several seconds and then a
 * paragraph appears in a single render — which feels like a freeze, not
 * thinking. A small per-tick budget makes the same content unfurl over
 * ~1s instead of one frame.
 *
 * Tuning: at TICK_MS=18, CHUNK_SIZE=3 we sustain ~165 chars/sec — about
 * 3× a fast typist. Faster than that and the smoothing is invisible.
 *
 * Lifecycle:
 *   - push(kind, text)        — slice a delta into queue items
 *   - flushNowSync()          — drain queue immediately (used before
 *                               emitting an image so text lands first)
 *   - waitForDrain()          — promise that resolves when the queue
 *                               empties naturally (used at end-of-stream
 *                               so isStreaming flips after the last
 *                               characters have rendered)
 *   - cancel()                — abort: drop queue, stop ticking. Used
 *                               by stop() so the user's click is honored
 *                               immediately, not after the buffer drains.
 *
 * Hydration path (loading old messages from server) bypasses this — we
 * only ever call push() from inside an active stream's onDelta.
 */
type Throttler = ReturnType<typeof makeThrottler>;

function makeThrottler(apply: (kind: 'content' | 'reasoning', text: string) => void) {
  const TICK_MS = 18;
  const CHUNK_SIZE = 3;
  // Below this threshold we don't slice — most upstream deltas are
  // tiny and look fine raw.
  const SLICE_THRESHOLD = CHUNK_SIZE * 2;

  const queue: Array<{ kind: 'content' | 'reasoning'; text: string }> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let cancelled = false;
  let drainResolve: (() => void) | null = null;

  function tick() {
    timer = null;
    if (cancelled) return;
    const item = queue.shift();
    if (item) apply(item.kind, item.text);
    if (queue.length > 0 && !cancelled) {
      timer = setTimeout(tick, TICK_MS);
    } else if (drainResolve) {
      const r = drainResolve;
      drainResolve = null;
      r();
    }
  }

  return {
    push(kind: 'content' | 'reasoning', text: string) {
      if (cancelled || !text) return;
      if (text.length <= SLICE_THRESHOLD) {
        queue.push({ kind, text });
      } else {
        for (let i = 0; i < text.length; i += CHUNK_SIZE) {
          queue.push({ kind, text: text.slice(i, i + CHUNK_SIZE) });
        }
      }
      if (!timer) timer = setTimeout(tick, TICK_MS);
    },
    flushNowSync() {
      if (cancelled) return;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      while (queue.length > 0) {
        const it = queue.shift()!;
        apply(it.kind, it.text);
      }
      if (drainResolve) {
        const r = drainResolve;
        drainResolve = null;
        r();
      }
    },
    waitForDrain(): Promise<void> {
      if (cancelled || queue.length === 0) return Promise.resolve();
      return new Promise<void>((resolve) => {
        drainResolve = resolve;
      });
    },
    cancel() {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      queue.length = 0;
      if (drainResolve) {
        const r = drainResolve;
        drainResolve = null;
        r();
      }
    },
  };
}

function handleEvent(
  raw: string,
  onDelta: (delta: {
    content?: string;
    reasoning?: string;
    imageUrl?: string;
    /** M24: emitted exactly once per turn when SSE finishes — carries
     *  the upstream's final token counts and resolved model name. */
    usage?: UsageInfo;
    /** M31-A: per-collaborator breakdown payload, sent in its own
     *  frame after the merged answer. Single-shot per turn. */
    collaborationDetails?: CollaborationDetail[];
  }) => void,
): void {
  // An event may have multiple `data:` lines per spec — concatenate.
  const lines = raw.split('\n');
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return;
  const payload = dataLines.join('\n');
  if (payload === '[DONE]') return;
  try {
    const json = JSON.parse(payload);
    const choice = json?.choices?.[0];
    const delta = choice?.delta ?? {};
    // M16: conv-svc emits `delta.image: { url }` when the built-in
    // image_generation tool finishes a frame. Single-shot today (no
    // partials) — multiple url events would be appended in order.
    const imageUrl =
      delta?.image && typeof delta.image.url === 'string' ? delta.image.url : undefined;

    // M24: the final SSE frame carries `usage` at the json root (and
    // `model`) — both Chat Completions and conv-svc's Responses
    // adapter (messages.ts:401-414) emit this shape. Don't gate on
    // delta.content being absent: per OpenAI spec the usage frame can
    // arrive together with finish_reason=stop and an empty delta.
    let usage: UsageInfo | undefined;
    if (
      json?.usage &&
      typeof json.usage.prompt_tokens === 'number' &&
      typeof json.usage.completion_tokens === 'number'
    ) {
      usage = {
        promptTokens: json.usage.prompt_tokens,
        completionTokens: json.usage.completion_tokens,
        // `model` is the upstream-resolved one (after channel
        // model_mapping); fall back to empty string only — the cost
        // lookup will then miss and we render token-only.
        model: typeof json.model === 'string' ? json.model : '',
      };
    }

    // M31-A: per-model breakdown for collaboration turns. Conv-svc
    // emits this as `delta.collaboration_details = [...]` in its own
    // frame; surface as a typed array so the UI can render the
    // collapsed panel without inspecting raw deltas.
    let collaborationDetails: CollaborationDetail[] | undefined;
    const rawDetails = delta?.collaboration_details;
    if (Array.isArray(rawDetails)) {
      collaborationDetails = rawDetails
        .filter((d): d is Record<string, unknown> => !!d && typeof d === 'object')
        .map((d) => ({
          model: typeof d.model === 'string' ? d.model : '',
          content: typeof d.content === 'string' ? d.content : '',
          promptTokens:
            typeof d.prompt_tokens === 'number' ? d.prompt_tokens : undefined,
          completionTokens:
            typeof d.completion_tokens === 'number'
              ? d.completion_tokens
              : undefined,
          durationMs:
            typeof d.duration_ms === 'number' ? d.duration_ms : undefined,
          error: typeof d.error === 'string' ? d.error : undefined,
        }));
    }

    onDelta({
      content: typeof delta.content === 'string' ? delta.content : undefined,
      // Some providers (Claude via new-api, o1 family) emit reasoning_content.
      reasoning:
        typeof delta.reasoning_content === 'string'
          ? delta.reasoning_content
          : typeof delta.reasoning === 'string'
            ? delta.reasoning
            : undefined,
      imageUrl,
      usage,
      collaborationDetails,
    });
  } catch {
    /* ignore non-JSON keepalive frames */
  }
}
