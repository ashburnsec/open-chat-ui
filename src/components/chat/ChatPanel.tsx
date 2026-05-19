'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { SelfUser, SystemStatus } from '@/lib/newapi-client';
import { WelcomeBanner } from '@/components/chat/WelcomeBanner';
import { ChatComposer, type ComposerOptions } from '@/components/chat/ChatComposer';
import { MessageList } from '@/components/chat/MessageList';
import { useChatStream, type ChatMessage } from '@/hooks/use-chat-stream';
import {
  filterChatModels,
  getModelCapabilities,
  getModelMaxTokensCap,
  getValidReasoningEfforts,
  modelRequiresResponsesApi,
} from '@/lib/chat-models';
import { findModelEntry, resolveModelId } from '@/lib/models-catalog';
import { notifyConversationsChanged } from '@/components/sidebar/ConversationList';
import type { ConversationDefaultParams } from '@/lib/conv';
import { resolveBrand } from '@/lib/brand';
import { ensurePricingLoaded } from '@/lib/pricing-cache';
import { AgentInfoModal } from '@/components/chat/AgentInfoModal';

const MODEL_PREF_KEY = 'cp:last-model';
const COMPOSER_OPTS_KEY = 'cp:composer-opts';

const DEFAULT_OPTIONS: ComposerOptions = {
  webSearch: false,
  reasoningEffort: null,
  imageMode: false,
  videoDuration: '8',
};

/**
 * Translate composer toggle state into upstream OpenAI-compatible body fields.
 *
 * - Web search → routes the turn through the Responses API (`/v1/responses`),
 *   the only surface that ships built-in `web_search`. Chat Completions
 *   (which `/pg/chat/completions` is hardcoded to) has no equivalent for
 *   GPT-5. We send `tools: [{type:'web_search'}]` plus the
 *   `endpoint:'responses'` routing flag — conv-svc reads the flag to pick
 *   the upstream endpoint, mints a per-user internal token, and adapts
 *   `reasoning_effort`→`reasoning.effort` on the way out.
 *
 * - Reasoning effort → sends `reasoning_effort: low|medium|high|minimal`,
 *   which conv-svc forwards to Chat Completions verbatim or translates
 *   to `reasoning.effort` for Responses.
 */
function buildExtraBody(
  opts: ComposerOptions,
  capabilities: { webSearch: boolean; reasoning: boolean; imageGeneration: boolean; video: boolean; audio: boolean },
  model: string | null,
): Record<string, unknown> {
  // M27: video task surface lives on a different upstream endpoint
  // (`POST /v1/videos`); the only thing the composer feeds in is the
  // duration. None of the chat-only knobs (tools/reasoning_effort/
  // max_tokens) apply, so short-circuit before they get added.
  // M38: 加 size + last_frame_image 透传, conv-svc handleVideoTask 接.
  if (capabilities.video) {
    const videoExtra: Record<string, unknown> = {
      seconds: opts.videoDuration ?? '8',
    };
    if (opts.videoSize) videoExtra.size = opts.videoSize;
    if (opts.videoLastFrame) videoExtra.last_frame_image = opts.videoLastFrame;
    // M42-S4: Veo 起始帧 image-to-video. vendor adaptor.go 读 req.Images[0]
    // 作首帧, req.Images[1] 作尾帧. 这里组 data URI 数组送 newapi /v1/videos.
    // 顺序: [first, last] — vendor 按 index 取. last 可独立用 metadata 字段,
    // 这里同时送 images[1] 让 vendor 任一路径都能拿到尾帧.
    const images: string[] = [];
    if (opts.videoFirstFrame) {
      images.push(
        `data:${opts.videoFirstFrame.mimeType};base64,${opts.videoFirstFrame.bytesBase64Encoded}`,
      );
    }
    if (opts.videoLastFrame) {
      images.push(
        `data:${opts.videoLastFrame.mimeType};base64,${opts.videoLastFrame.bytesBase64Encoded}`,
      );
    }
    if (images.length > 0) videoExtra.images = images;
    return videoExtra;
  }
  // M29-I: audio surface skips conv-svc entirely — handleSend takes
  // the TTS branch and calls /api/audio/speech directly. extra body
  // unused.
  if (capabilities.audio) {
    return {};
  }

  const extra: Record<string, unknown> = {};
  const tools: Array<{ type: string }> = [];

  // M29-D: web_search is now vendor-agnostic — composer button is on
  // for every chat model. For OpenAI-routed (Responses) models the
  // tool entry stays as `{type:'web_search'}` and Responses uses its
  // built-in search; for other vendors conv-svc detects the tool,
  // runs Tavily, and strips the entry before forwarding upstream.
  if (opts.webSearch) tools.push({ type: 'web_search' });

  // M16: when the model supports it, ALWAYS offer the image_generation
  // tool so the assistant can spontaneously paint when the user asks.
  // image_generation is OpenAI-only and Responses-only — composer hides
  // the button on other vendors via getModelCapabilities.
  if (capabilities.imageGeneration) {
    tools.push({ type: 'image_generation' });
  }
  if (opts.imageMode && capabilities.imageGeneration) {
    extra.tool_choice = { type: 'image_generation' };
  }

  // M29-D: Responses-API routing now decided ONLY by the model itself
  // (Azure-direct or image-generation tool). Plain web_search no
  // longer flips us to Responses — Tavily covers non-OpenAI vendors.
  const forceResponses =
    modelRequiresResponsesApi(model) ||
    tools.some((t) => t.type === 'image_generation');

  if (forceResponses) {
    extra.endpoint = 'responses';
  }
  if (tools.length > 0) extra.tools = tools;
  if (opts.reasoningEffort) {
    extra.reasoning_effort = opts.reasoningEffort;
  }
  // M31-A: forward collaborator picks. conv-svc detects this and runs
  // the multi-model orchestrator instead of the regular streaming path.
  if (opts.collaborators && opts.collaborators.length > 0) {
    extra.collaborators = opts.collaborators;
  }
  // Per-model max_tokens cap. gemini-*-image-preview returns 1k+
  // image tokens per call — without a cap any caller-set max_tokens
  // (or upstream default) routinely trips a 429 Resource exhausted.
  // 80 keeps both the text reply and the image inside the budget.
  const cap = getModelMaxTokensCap(model);
  if (cap !== undefined && extra.max_tokens === undefined) {
    extra.max_tokens = cap;
  }
  return extra;
}

/** Minimal display info for the agent badge — no system_prompt etc. */
export type ChatPanelAgent = {
  id: number;
  slug: string;
  name: string;
  avatar: string;
};

export function ChatPanel({
  user,
  status,
  models: rawModels,
  conversationId: initialConvId,
  conversationModel,
  conversationAgent,
  conversationDefaultParams,
  initialMessages = [],
}: {
  user: SelfUser;
  status: SystemStatus;
  models: string[];
  /** Set on /c/[id] pages; absent on the welcome page (`/`). */
  conversationId?: string;
  /** Model the conversation was created with — locks the picker on resume. */
  conversationModel?: string;
  /** M13: agent the conversation was bound to at creation, if any. */
  conversationAgent?: ChatPanelAgent | null;
  /** M17-P1a: composer toggles snapshot from agent at creation. NULL on
   *  /c/[id] pages where the conv didn't bind an agent or had no preset. */
  conversationDefaultParams?: ConversationDefaultParams | null;
  initialMessages?: ChatMessage[];
}) {
  const router = useRouter();
  const tComposer = useTranslations('chat.composer');
  const tVideo = useTranslations('chat.video');
  const tErrors = useTranslations('chat.errors');
  const tAgentsBadge = useTranslations('agents.badge');
  // The chat surface is text-only. Image / audio / video models — even
  // when the upstream channel exposes them — would just 4xx through
  // /pg/chat/completions because they live on different relay endpoints.
  // Filter them out here so the picker stays useful. (M16: image
  // generation is no longer a separate page — it's a built-in tool the
  // text models invoke via the Responses API.)
  //
  // useMemo keyed on the joined string keeps the array IDENTITY stable
  // across renders when content is unchanged. Without this, every
  // ChatPanel render would produce a new `models` array, retriggering
  // any effect with `[models]` in its deps — and the previous version
  // of this file paired such an effect with another that wrote back to
  // localStorage, causing a literal infinite ping-pong (#cookie-rotation).
  const models = useMemo(
    () => filterChatModels(rawModels),
    [rawModels.join(' ')],
  );

  // Remember the user's last-used model across page loads. We avoid the
  // ping-pong above by:
  //   1) initialising state synchronously to a deterministic value
  //      (conversationModel for resumed chats; models[0] otherwise) so
  //      SSR/CSR agree.
  //   2) hydrating from localStorage exactly ONCE on mount — never on
  //      subsequent renders.
  //   3) persisting on user-driven changes (deps: [model]).
  //
  // Critically the hydrator effect MUST NOT depend on `models` — that
  // would re-run on every render that produces a new filtered array
  // and overwrite the user's just-clicked selection.
  const [model, setModel] = useState<string | null>(
    () => conversationModel ?? models[0] ?? null,
  );
  useEffect(() => {
    if (conversationModel) return; // model locked to the conv's original
    const saved = window.localStorage.getItem(MODEL_PREF_KEY);
    // M29-B: legacy bare names (e.g. 'gpt-5.4') get upgraded to their
    // default mangled variant. If the upgraded id is in the available
    // list, use it; otherwise fall through to models[0].
    const upgraded = saved ? resolveModelId(saved) : '';
    if (upgraded && models.includes(upgraded)) {
      setModel(upgraded);
    }
    // Mount-only on purpose; see comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // M24: prefetch the pricing catalog so the cost badges on assistant
  // bubbles can resolve their model lookup synchronously. Fire-and-
  // forget — `<UsageBadge>` subscribes to the cache version internally
  // and re-renders once data lands.
  useEffect(() => {
    void ensurePricingLoaded();
  }, []);
  useEffect(() => {
    if (!conversationModel && model) window.localStorage.setItem(MODEL_PREF_KEY, model);
  }, [model, conversationModel]);

  // M29-C: listen for sidebar ModelLibrary picks. Sidebar dispatches
  // `cp:model-changed` when the user picks a variant; we update local
  // state so the next send uses it. Conversation-bound chats can still
  // switch model per send — same as the old HeaderBar dropdown.
  useEffect(() => {
    function onPick(e: Event) {
      const id = (e as CustomEvent<string>).detail;
      if (typeof id === 'string' && id) setModel(id);
    }
    window.addEventListener('cp:model-changed', onPick);
    return () => window.removeEventListener('cp:model-changed', onPick);
  }, []);

  const [convId, setConvId] = useState<string | undefined>(initialConvId);

  // Composer toggles (web search + reasoning effort + image mode).
  //
  // Init priority:
  //   1) conv-snapshot (agent's default_params, captured at conv creation)
  //   2) localStorage cp:composer-opts (user's last global preference)
  //   3) DEFAULT_OPTIONS
  //
  // Snapshot wins so an agent's "writing-with-web-search-on" preset
  // takes effect even if the user's global pref is "search off". When
  // a snapshot is in play we don't sync changes back to localStorage —
  // local toggles inside that conv would otherwise pollute the global
  // pref and surprise the user the next time they open a fresh chat.
  const hasSnapshot = !!conversationDefaultParams;
  const [opts, setOpts] = useState<ComposerOptions>(() =>
    conversationDefaultParams
      ? { ...DEFAULT_OPTIONS, ...conversationDefaultParams }
      : DEFAULT_OPTIONS,
  );
  useEffect(() => {
    if (hasSnapshot) return;
    const raw = window.localStorage.getItem(COMPOSER_OPTS_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as ComposerOptions;
        if (parsed && typeof parsed === 'object') setOpts({ ...DEFAULT_OPTIONS, ...parsed });
      } catch {
        /* corrupted — ignore */
      }
    }
    // Mount-only on purpose; opts source is fixed at first paint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (hasSnapshot) return;
    window.localStorage.setItem(COMPOSER_OPTS_KEY, JSON.stringify(opts));
  }, [opts, hasSnapshot]);

  // Per-model capability gating. When the user switches to a model that
  // doesn't support a feature they had on (e.g. webSearch on, then they
  // pick DeepSeek), force the option off so the next send doesn't carry
  // it into a request the upstream would silently drop or 4xx.
  const capabilities = useMemo(() => getModelCapabilities(model), [model]);
  // Per-model effort whitelist. gpt-5.4-pro rejects `low`/`minimal` even
  // though `reasoning` capability is true — so we clamp the user's saved
  // effort to whatever the new model accepts.
  const validEfforts = useMemo(() => getValidReasoningEfforts(model), [model]);
  const validEffortsKey = validEfforts.join(',');
  useEffect(() => {
    setOpts((prev) => {
      const nextEffort = !capabilities.reasoning
        ? null
        : prev.reasoningEffort && validEfforts.includes(prev.reasoningEffort)
          ? prev.reasoningEffort
          : null;
      return {
        webSearch: capabilities.webSearch ? prev.webSearch : false,
        reasoningEffort: nextEffort,
        imageMode: capabilities.imageGeneration ? prev.imageMode : false,
        // M27: keep the user's last duration sticky between video sends;
        // default to 8s on first selection.
        videoDuration: prev.videoDuration ?? '8',
      };
    });
    // Intentionally only reacts to the capability flags + effort list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilities.webSearch, capabilities.reasoning, capabilities.imageGeneration, capabilities.video, validEffortsKey]);

  const {
    messages,
    send,
    stop,
    isStreaming,
    error,
    setMessages,
    setError,
    retryAfterDeadline,
  } = useChatStream(initialMessages);

  /**
   * Truncate the conversation server-side from `fromMessageId` onward
   * (inclusive). The id is what conv-svc returns — `String(messages.id)`.
   * No-ops for ephemeral chats (no convId), so callers can use this
   * uniformly without checking persistence state.
   */
  async function truncateFrom(fromMessageId: string) {
    if (!convId) return;
    // Numeric ids only — newly-streamed (in-memory) assistant messages have
    // a UUID and aren't yet persisted; just drop them client-side.
    const numeric = Number(fromMessageId);
    if (!Number.isInteger(numeric) || numeric <= 0) return;
    await fetch(
      `/api/conversations/${convId}/messages?from=${numeric}`,
      { method: 'DELETE' },
    );
  }

  async function handleDelete(id: string) {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      return idx === -1 ? prev : prev.slice(0, idx);
    });
    await truncateFrom(id);
    notifyConversationsChanged();
  }

  async function handleRegenerate(assistantId: string) {
    if (!model) return;
    const idx = messages.findIndex((m) => m.id === assistantId);
    if (idx <= 0) return;
    const userMsg = messages[idx - 1];
    if (userMsg.role !== 'user') return;
    // M29-I: audio model — drop the old assistant + re-synthesise.
    if (capabilities.audio) {
      setMessages((prev) => prev.slice(0, idx));
      await handleSendAudio(userMsg.content);
      return;
    }
    // Drop the assistant + user pair locally; truncate user (and the
    // assistant after it) on the server. Then re-send the user content
    // through the regular send pipeline so the user row is re-inserted
    // and a fresh assistant turn streams in.
    setMessages((prev) => prev.slice(0, idx - 1));
    await truncateFrom(userMsg.id);
    await send(userMsg.content, {
      model,
      conversationId: convId,
      extra: buildExtraBody(opts, capabilities, model),
      attachments: userMsg.attachments,
    });
    notifyConversationsChanged();
  }

  async function handleEdit(userId: string, newText: string) {
    if (!model) return;
    const idx = messages.findIndex((m) => m.id === userId);
    if (idx === -1 || messages[idx].role !== 'user') return;
    const original = messages[idx];
    setMessages((prev) => prev.slice(0, idx));
    await truncateFrom(userId);
    await send(newText, {
      model,
      conversationId: convId,
      extra: buildExtraBody(opts, capabilities, model),
      attachments: original.attachments,
    });
    notifyConversationsChanged();
    // M41 B2: 编辑后无法切兄弟分支的根因 — send() 的 SSE delta 只构造了
    // 新 user/assistant 两条 row, 没带 siblingCount/siblingIndex/siblingIds.
    // 之前依赖 router.refresh() 重渲 server component, 但因 ChatPanel 内
    // useState(initialMessages) 只在 mount 时取值, prop 变化不会再同步,
    // 所以 chevron 切换按钮永远不显示. 改: fetch BFF 拿带 sibling 注解,
    // 按 dbId 匹配 patch 进现有 messages (其他字段不动, 安全).
    if (convId) {
      try {
        const r = await fetch(`/api/conversations/${encodeURIComponent(convId)}/messages`);
        const j = await r.json();
        const items = (j?.data?.items ?? j?.data ?? []) as Array<{
          id: number;
          siblingCount?: number;
          siblingIndex?: number;
          siblingIds?: number[];
        }>;
        if (Array.isArray(items) && items.length > 0) {
          const byId = new Map(items.map((m) => [m.id, m]));
          setMessages((prev) =>
            prev.map((msg) => {
              if (msg.dbId == null) return msg;
              const s = byId.get(msg.dbId);
              if (!s) return msg;
              return {
                ...msg,
                siblingCount: s.siblingCount,
                siblingIndex: s.siblingIndex,
                siblingIds: s.siblingIds,
              };
            }),
          );
        }
      } catch {
        // best-effort; router.refresh 兜底
      }
    }
    router.refresh();
  }

  /**
   * Wraps useChatStream's send so the welcome page (no conv yet) lazily
   * creates a conversation on the first turn, swaps the URL to /c/[id]
   * without unmounting React state, then forwards the prompt.
   */
  async function handleSend(
    text: string,
    attachments: ChatMessage['attachments'],
    documents?: ChatMessage['documents'],
  ) {
    if (!model) return;
    // M29-I: audio (TTS) models bypass conv-svc and the SSE chat
    // pipeline entirely — call /api/audio/speech directly, attach
    // the resulting blob URL as an in-memory assistant reply. V1
    // does not persist audio replies.
    if (capabilities.audio) {
      await handleSendAudio(text);
      return;
    }
    // M42-S1: image-native models (gpt-image-2 等) 不接 SSE chat completions
    // — gpt-image-2 只能走 OpenAI 原生 /v1/images/generations. 用专用
    // endpoint /api/conversations/:id/image-message, conv-svc 复用 callImageGen
    // 出图后写 user+asst messages 对儿返回, ChatPanel 直接 push 到 state.
    const isImageNative = findModelEntry(model)?.category === 'image' && model === 'gpt-image-2';
    if (isImageNative) {
      await handleSendImage(text);
      return;
    }
    let id = convId;
    if (!id) {
      try {
        const r = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, title: text.slice(0, 40) }),
        });
        const j = await r.json();
        if (!j?.success || !j.data?.id) {
          setError(j?.message || tErrors('createConvFailed'));
          return;
        }
        id = j.data.id as string;
        setConvId(id);
        window.history.replaceState(null, '', `/c/${id}`);
        notifyConversationsChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : tErrors('createConvFailed'));
        return;
      }
    }
    await send(text, {
      model,
      conversationId: id,
      extra: buildExtraBody(opts, capabilities, model),
      attachments,
      documents,
    });
    notifyConversationsChanged();
  }

  /**
   * M42-S1 · chat 流的 image-native 模型发送 (gpt-image-2).
   *
   *   1. 立刻在 messages 末尾 push user + 占位 asst (loading state)
   *   2. 若未创建 conv 则 lazy-create (沿用普通 chat 模式, 不动 URL sync)
   *   3. POST /api/conversations/:id/image-message → 返回 { userMessage, assistantMessage }
   *   4. 用 server 真消息替换占位, 失败 → 占位 asst 显错
   *
   * 注: 不复用 send() 是因为 send() 包了 useChatStream 的 SSE 逻辑, image
   * 这条路径是 fire-and-await 一次性, 共用没意义.
   */
  async function handleSendImage(textPrompt: string) {
    if (!model) return;
    const prompt = textPrompt.trim();
    if (!prompt) return;
    let id = convId;
    if (!id) {
      try {
        const r = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, title: prompt.slice(0, 40) }),
        });
        const j = await r.json();
        if (!j?.success || !j.data?.id) {
          setError(j?.message || tErrors('createConvFailed'));
          return;
        }
        id = j.data.id as string;
        setConvId(id);
        window.history.replaceState(null, '', `/c/${id}`);
        notifyConversationsChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : tErrors('createConvFailed'));
        return;
      }
    }

    const localUserId = crypto.randomUUID();
    const localAsstId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: localUserId, role: 'user', content: prompt },
      {
        id: localAsstId,
        role: 'assistant',
        content: '',
        imageGenerating: { startedAt: Date.now(), model },
      },
    ]);

    try {
      const r = await fetch(
        `/api/conversations/${encodeURIComponent(id)}/image-message`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            model,
            aspect: opts.imageAspect,
            tier: opts.imageTier,
            quality: opts.imageQuality,
          }),
        },
      );
      const j = await r.json();
      if (!j?.success || !j.data) {
        setError(j?.message || '生成失败');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === localAsstId
              ? {
                  ...m,
                  content: `生成失败：${j?.message ?? '未知错误'}`,
                  imageGenerating: undefined,
                }
              : m,
          ),
        );
        return;
      }
      const { userMessage: u, assistantMessage: a } = j.data as {
        userMessage: { id: number; content: { text?: string } };
        assistantMessage: {
          id: number;
          content: {
            text?: string;
            generatedImages?: Array<{ url: string; prompt: string; error?: string }>;
          };
          model?: string | null;
        };
      };
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id === localUserId) {
            return { ...m, id: String(u.id), dbId: u.id, content: u.content?.text ?? prompt };
          }
          if (m.id === localAsstId) {
            return {
              ...m,
              id: String(a.id),
              dbId: a.id,
              content: a.content?.text ?? '',
              generatedImages: a.content?.generatedImages,
              imageGenerating: undefined,
            };
          }
          return m;
        }),
      );
      notifyConversationsChanged();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '生成失败';
      setError(msg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === localAsstId
            ? { ...m, content: `生成失败：${msg}`, imageGenerating: undefined }
            : m,
        ),
      );
    }
  }

  async function handleSendAudio(text: string) {
    if (!text.trim()) return;
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    };
    const asstMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
    };
    setMessages((prev) => [...prev, userMsg, asstMsg]);
    try {
      const voice = opts.audioVoice ?? 'alloy';
      const res = await fetch('/api/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: text, voice }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg =
          (j as { message?: string }).message ?? `HTTP ${res.status}`;
        setError(msg);
        setMessages((prev) => prev.filter((m) => m.id !== asstMsg.id));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === asstMsg.id
            ? {
                ...m,
                audioReply: { voice, url, text },
              }
            : m,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'audio send failed');
      setMessages((prev) => prev.filter((m) => m.id !== asstMsg.id));
    }
  }

  // Surface stream errors as a dismissible banner above the composer.
  // `error` clears on next send().
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(t);
  }, [error, setError]);

  const empty = messages.length === 0;

  // M41 B1: 全页拖拽 — 整个 ChatPanel 接 dragover/drop, 把 files 转发给
  // ChatComposer 的 ingest. 用户拖到任意位置都接收, 不只 composer 框.
  const [dropOverlay, setDropOverlay] = useState(false);
  // M43-Prompts-Library: agent 徽章点击弹 AgentInfoModal (取代跳编辑页).
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  function handleDragEnter(e: React.DragEvent) {
    if (Array.from(e.dataTransfer?.items ?? []).some((it) => it.kind === 'file')) {
      e.preventDefault();
      setDropOverlay(true);
    }
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }
  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOverlay(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDropOverlay(false);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      window.dispatchEvent(new CustomEvent('cp:composer-files', { detail: files }));
    }
  }

  return (
    <div
      className="relative flex h-full min-w-0 flex-1 flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {dropOverlay && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-ink/5 backdrop-blur-sm">
          <div className="rounded-md border-2 border-dashed border-ink bg-canvas px-8 py-6 text-center shadow-[var(--shadow-4)]">
            <p className="text-base font-medium text-ink">松开以上传文件</p>
            <p className="mt-1 text-xs text-muted-foreground">图片 / PDF / DOCX / TXT / MD</p>
          </div>
        </div>
      )}
      {conversationAgent && convId && (
        <AgentInfoModal
          open={agentModalOpen}
          onOpenChange={setAgentModalOpen}
          conversationId={convId}
          agent={conversationAgent}
          onChange={() => router.refresh()}
        />
      )}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center">
              <WelcomeBanner systemName={resolveBrand(status.system_name)} />
            </div>
          ) : (
            <MessageList
              messages={messages}
              isStreaming={isStreaming}
              conversationId={convId}
              onRegenerate={handleRegenerate}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onVideoTaskChange={(messageId, next) =>
                setMessages((prev) =>
                  prev.map((m) => (m.id === messageId ? { ...m, videoTask: next } : m)),
                )
              }
            />
          )}
        </div>
        {error && (
          <div className="mx-auto mb-2 w-full max-w-3xl px-3 sm:px-6">
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          </div>
        )}
        {conversationAgent && (
          <div className="mx-auto mb-2 flex w-full max-w-3xl justify-center px-3 sm:px-6">
            <button
              type="button"
              onClick={() => setAgentModalOpen(true)}
              title={tAgentsBadge('label')}
              className="group inline-flex items-center gap-2 rounded-pill border border-hairline bg-canvas px-4 py-1.5 text-xs text-ink shadow-[var(--shadow-2)] transition-all hover:-translate-y-0.5 hover:border-ink hover:shadow-[var(--shadow-3)]"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-canvas-soft text-sm">
                {conversationAgent.avatar}
              </span>
              <span className="font-medium">{conversationAgent.name}</span>
              <span className="rounded-full bg-canvas-soft px-1.5 py-0.5 text-[10px] text-ink opacity-0 transition-opacity group-hover:opacity-100">
                {tAgentsBadge('label')}
              </span>
            </button>
          </div>
        )}
        <ChatComposer
          onSend={(t, attachments, documents) =>
            void handleSend(t, attachments, documents)
          }
          onStop={stop}
          isStreaming={isStreaming}
          disabled={!model}
          placeholder={
            !model
              ? tComposer('pickModelFirst')
              : capabilities.video
                ? tVideo('promptPlaceholder')
                : capabilities.audio
                  ? tComposer('audioPlaceholder')
                  : tComposer('placeholderAsk')
          }
          options={opts}
          onOptionsChange={setOpts}
          capabilities={capabilities}
          imageNative={findModelEntry(model ?? '')?.category === 'image'}
          conversationId={convId}
          ensureConversationId={async () => {
            // M35: lazy-create when user picks a doc on /welcome before sending text.
            if (convId) return convId;
            if (!model) return null;
            try {
              const r = await fetch('/api/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, title: '新对话' }),
              });
              const j = await r.json();
              if (!j?.success || !j.data?.id) return null;
              const id = j.data.id as string;
              setConvId(id);
              window.history.replaceState(null, '', `/c/${id}`);
              notifyConversationsChanged();
              return id;
            } catch {
              return null;
            }
          }}
          currentModel={model}
          availableModels={models}
          retryAfterDeadline={retryAfterDeadline}
        />
      </div>
    </div>
  );
}
