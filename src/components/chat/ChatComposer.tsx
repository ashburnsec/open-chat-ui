'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUp, Globe, Brain, StopCircle, Paperclip, ImageIcon, FileText, X, Loader2, Clapperboard, AudioLines, Film, Maximize2, Ratio, Users, Camera } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { ChatAttachment, ChatDocument } from '@/hooks/use-chat-stream';
import type { ReasoningEffort } from '@/lib/chat-models';
import { veoCapabilities, type VeoCapabilities } from '@/lib/models-catalog';
import {
  findImageModel,
  resolveResolution,
  type AspectRatio,
  type ImageQuality,
  type Tier,
} from '@/lib/image-models';
import { StylePicker } from '@/components/chat/StylePicker';
import { CollaborationModal } from '@/components/chat/CollaborationModal';
import { applyStylePrefix, findStylePreset } from '@/lib/style-presets';

export type { ReasoningEffort };

/** M27: video duration tiers exposed in video-mode composer. Veo accepts
 *  any integer seconds upstream but UI surfaces the three tiers most
 *  users actually pick. */
export type VideoDuration = '4' | '6' | '8' | '16';
const VIDEO_DURATIONS: readonly VideoDuration[] = ['4', '8', '16'];

/** M38: Veo size/aspect/resolution. UI 由 VeoComposerPanel 维护, 送 conv-svc /v1/videos. */
export type VideoSize = '1280x720' | '1920x1080' | '3840x2160' | '720x1280' | '1080x1920';
export type VideoLastFrameImage = {
  bytesBase64Encoded: string;
  mimeType: string;
};

/** Composer-emitted options. Parent owns the toggle state — composer is purely visual. */
export type ComposerOptions = {
  webSearch: boolean;
  reasoningEffort: ReasoningEffort | null; // null = don't send the field at all
  /** When true the next send forces the upstream image_generation tool —
   *  model has no choice but to render an image. When false the tool is
   *  still offered (so the model can spontaneously paint) but it's free
   *  to answer with text. */
  imageMode: boolean;
  /** M27: Veo task duration in seconds. Only consulted when the selected
   *  model is veo-*; ignored otherwise. */
  videoDuration?: VideoDuration;
  /** M38: Veo 视频尺寸 — 送给 newapi /v1/videos `size` 字段, vendor 转 720p/1080p/4k.
   *  默认 '1920x1080' (Veo 多数模型的 1080p 默认). VeoComposerPanel 维护. */
  videoSize?: VideoSize;
  /** M38: Veo 首尾帧 — last_frame_image 透传到 vendor. 仅 Veo 3.1 系支持. */
  videoLastFrame?: VideoLastFrameImage | null;
  /** M42-S4: Veo 首帧 (image-to-video). Veo 全系都支持. 透传到 vendor
   *  作为 instance.Image (vendor adaptor.go line 150-165 已有逻辑读取). */
  videoFirstFrame?: VideoLastFrameImage | null;
  /** M29-E: one-click style preset id (matches lib/style-presets.ts).
   *  Active in image / video generation modes; ignored in regular
   *  text chat. null = no preset, send the user's prompt verbatim. */
  imageStyle?: string | null;
  videoStyle?: string | null;
  /** M29-I: TTS voice for audio-category models. Cycle through a
   *  short list of Azure-supported voices. */
  audioVoice?: AudioVoice;
  /** M31-A: collaborator model ids — when set + non-empty the next
   *  send fans out to N+1 models and the conv-svc orchestrator returns
   *  one merged answer + per-model breakdown. Picked via the
   *  CollaborationModal opened by the "+多模型" button. */
  collaborators?: string[];
  /** M42-S1: image-native model (gpt-image-2 等) 在 chat 流的尺寸/比例/质量
   *  picker 状态. 跟 wizard 的 image_config 同源 — conv-svc 的
   *  /v1/conversations/:id/image-message endpoint 接的就是这三字段. */
  imageAspect?: AspectRatio;
  imageTier?: Tier;
  imageQuality?: ImageQuality;
};

export type AudioVoice = 'alloy' | 'coral' | 'echo' | 'nova' | 'shimmer';
const AUDIO_VOICES: readonly AudioVoice[] = ['alloy', 'coral', 'echo', 'nova', 'shimmer'];

/** Cap per-image and per-message totals — multimodal payloads ballooning past
 *  this cripples both upload time and the model's per-request token budget. */
const MAX_FILE_BYTES = 8 * 1024 * 1024;        // 8 MB / image after base64 → ~6 MB raw
const MAX_TOTAL_FILES = 4;                     // OpenAI accepts more but UX gets noisy
const MAX_DOC_BYTES = 20 * 1024 * 1024;        // 20 MB / doc — server enforces same cap
const MAX_TOTAL_DOCS = 4;

const DOC_MIME_HINTS: readonly string[] = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
];
const DOC_EXT_RE = /\.(pdf|docx|txt|md|markdown)$/i;
function isDocumentFile(f: File): boolean {
  return DOC_MIME_HINTS.includes(f.type) || DOC_EXT_RE.test(f.name);
}

export function ChatComposer({
  onSend,
  onStop,
  isStreaming,
  disabled,
  placeholder,
  options,
  onOptionsChange,
  capabilities = { webSearch: true, reasoning: true, vision: true, imageGeneration: true, video: false, audio: false },
  imageNative = false,
  validEfforts,
  conversationId,
  ensureConversationId,
  currentModel,
  availableModels,
  retryAfterDeadline,
}: {
  onSend: (
    text: string,
    attachments: ChatAttachment[],
    documents: ChatDocument[],
  ) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled: boolean;
  placeholder?: string;
  options: ComposerOptions;
  onOptionsChange: (opts: ComposerOptions) => void;
  /** Per-model capability flags. Buttons whose capability is false get
   *  hidden so we never offer a feature the upstream silently drops.
   *  Defaults to all-true for back-compat / SSR. */
  capabilities?: {
    webSearch: boolean;
    reasoning: boolean;
    vision: boolean;
    imageGeneration: boolean;
    video: boolean;
    audio: boolean;
  };
  /** M29-E: true when the selected model is itself an image-generation
   *  model (catalog category='image' — e.g. gemini-3.1-flash-image-preview,
   *  gpt-image-2). Different from `capabilities.imageGeneration` which
   *  represents the OpenAI Responses image_generation tool offered as
   *  a side feature on text models. */
  imageNative?: boolean;
  /** Per-model whitelist of reasoning_effort tiers the upstream actually
   *  accepts. ThinkPicker cycles through this list. Empty / undefined =
   *  fall back to all 5 tiers. */
  validEfforts?: readonly ReasoningEffort[];
  /** M17-P2: scopes the document upload endpoint to a specific conv. */
  conversationId?: string;
  /** M35: lazy-create a conversation when the user picks a doc on the
   *  welcome page (no convId yet). Returns the freshly-minted conv id
   *  the composer then uses for the upload. Without this hook the
   *  composer surfaces an error and rejects the doc, forcing the user
   *  to send a text first. */
  ensureConversationId?: () => Promise<string | null>;
  /** M31-A: id of the current primary model — passed to the collaboration
   *  modal so it can hide it from the picker (no point picking yourself). */
  currentModel?: string | null;
  /** M31-A: full set of model ids available in this session (post chat-
   *  filter) — the modal groups by displayName + filters down to
   *  chat/code categories internally. */
  availableModels?: readonly string[];
  /** M32-2.A: ms-epoch deadline at which a rate-limited send can retry.
   *  null when not rate-limited. We disable Send + render a countdown
   *  while `Date.now() < deadline`. */
  retryAfterDeadline?: number | null;
}) {
  const t = useTranslations('chat.composer');
  const tCollab = useTranslations('chat.collaboration');
  const [collabOpen, setCollabOpen] = useState(false);
  const [text, setText] = useState('');
  // M32-2.A: tick once per second while a retry deadline is in the future
  // so the countdown re-renders. When deadline passes we clear the tick
  // (no more renders, button re-enables).
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (retryAfterDeadline == null) return;
    if (retryAfterDeadline <= Date.now()) return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [retryAfterDeadline]);
  const retrySecondsLeft =
    retryAfterDeadline != null
      ? Math.max(0, Math.ceil((retryAfterDeadline - Date.now()) / 1000))
      : 0;
  const rateLimited = retrySecondsLeft > 0;
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [documents, setDocuments] = useState<ChatDocument[]>([]);
  /** Doc ids being uploaded right now — keeps each chip in a "spinner"
   *  state until the parser finishes server-side. */
  const [uploadingDocs, setUploadingDocs] = useState<string[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Autosize the textarea (1–8 rows) so the composer grows with the prompt.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const max = 8 * 28; // ~8 lines at 28px line-height (leading-7)
    ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
  }, [text]);

  // M40+: WelcomeBanner quick-start chip 通过 window event 注入 prompt,
  // composer 在这里接住 setText + focus + 把光标放到代码块 (```...```) 内.
  // 不直接发送, 让用户能改完再点发送.
  useEffect(() => {
    function onPrefill(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      if (typeof detail !== 'string') return;
      setText(detail);
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        // 找代码块第一对 ``` 中间, 把光标停在那里; 没有就停到末尾.
        const open = detail.indexOf('```');
        const nl = open >= 0 ? detail.indexOf('\n', open + 3) : -1;
        const caret = nl >= 0 ? nl + 1 : detail.length;
        ta.setSelectionRange(caret, caret);
      });
    }
    window.addEventListener('cp:composer-prefill', onPrefill);
    return () => window.removeEventListener('cp:composer-prefill', onPrefill);
  }, []);

  // M41 B1: 全页拖拽支持 — ChatPanel 在外层捕获 drop, 通过 window event
  // 把 files 转发给 composer 的 ingest. 用户能拖到 message 区也接收, 不只
  // composer 框. 仍保留 composer 自己的 onDrop (兼容拖到 composer 直接放).
  useEffect(() => {
    function onExternalDrop(e: Event) {
      const detail = (e as CustomEvent<FileList | File[]>).detail;
      if (!detail) return;
      void ingest(detail);
    }
    window.addEventListener('cp:composer-files', onExternalDrop);
    return () => window.removeEventListener('cp:composer-files', onExternalDrop);
    // ingest captures setState, no need to declare; this effect only mounts once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Validate + stash incoming files. Splits the batch into image-style
   * (base64-encoded inline) and document-style (uploaded server-side
   * for parsing). Anything we don't recognise becomes a friendly error.
   */
  async function ingest(files: FileList | File[]): Promise<void> {
    setAttachError(null);
    const arr = Array.from(files);
    const images = arr.filter((f) => f.type.startsWith('image/'));
    const docs = arr.filter((f) => !f.type.startsWith('image/') && isDocumentFile(f));
    const rest = arr.filter(
      (f) => !f.type.startsWith('image/') && !isDocumentFile(f),
    );
    if (rest.length > 0) {
      setAttachError(t('unsupportedFileType', { name: rest[0]!.name }));
      // keep going — process the recognised files anyway
    }
    if (images.length + attachments.length > MAX_TOTAL_FILES) {
      setAttachError(t('tooManyImages', { max: MAX_TOTAL_FILES }));
      return;
    }
    if (docs.length + documents.length > MAX_TOTAL_DOCS) {
      setAttachError(t('tooManyDocs', { max: MAX_TOTAL_DOCS }));
      return;
    }

    // M42-S4: video 模式下图片自动当 first frame 而非 multimodal attachment.
    // 拖拽 / 粘贴 / 点选都走这条路径. 已设首帧则提示替换 / 忽略.
    if (capabilities.video && images.length > 0) {
      const firstImg = images[0]!;
      if (firstImg.size > MAX_FILE_BYTES) {
        setAttachError(t('fileTooLargeNamed', {
          name: firstImg.name,
          maxMB: (MAX_FILE_BYTES / 1024 / 1024).toFixed(0),
        }));
      } else {
        const b64 = await fileToBase64(firstImg);
        // 已有首帧 — 提示直接覆盖 (toast). 用户也可点首帧按钮的 x 清除.
        if (options.videoFirstFrame) {
          toast.info('首帧已替换为新图');
        }
        onOptionsChange({
          ...options,
          videoFirstFrame: {
            bytesBase64Encoded: b64,
            mimeType: firstImg.type || 'image/png',
          },
        });
        if (images.length > 1) {
          toast.info(`只取第 1 张作首帧, 忽略其余 ${images.length - 1} 张`);
        }
      }
      // video 模式下不接 docs (Veo 不读文档), 但不阻止其他校验.
      return;
    }

    // Images: synchronous base64-encode + push.
    const nextImg: ChatAttachment[] = [];
    for (const f of images) {
      if (f.size > MAX_FILE_BYTES) {
        setAttachError(
          t('fileTooLargeNamed', {
            name: f.name,
            maxMB: (MAX_FILE_BYTES / 1024 / 1024).toFixed(0),
          }),
        );
        continue;
      }
      const b64 = await fileToBase64(f);
      nextImg.push({
        id: crypto.randomUUID(),
        mime: f.type,
        b64,
        name: f.name || 'image',
      });
    }
    if (nextImg.length) setAttachments((prev) => [...prev, ...nextImg]);

    // Documents: need a conversation context to upload. The welcome
    // page (no convId yet) used to block uploads outright; M35 lets
    // the parent lazily create one via ensureConversationId().
    if (docs.length === 0) return;
    let convIdForUpload = conversationId;
    if (!convIdForUpload) {
      if (ensureConversationId) {
        try {
          const created = await ensureConversationId();
          if (!created) {
            setAttachError(t('docsNeedConversation'));
            return;
          }
          convIdForUpload = created;
        } catch {
          setAttachError(t('docsNeedConversation'));
          return;
        }
      } else {
        setAttachError(t('docsNeedConversation'));
        return;
      }
    }
    for (const f of docs) {
      if (f.size > MAX_DOC_BYTES) {
        setAttachError(
          t('fileTooLargeNamed', {
            name: f.name,
            maxMB: (MAX_DOC_BYTES / 1024 / 1024).toFixed(0),
          }),
        );
        continue;
      }
      const localId = crypto.randomUUID();
      setUploadingDocs((prev) => [...prev, localId]);
      try {
        const fd = new FormData();
        fd.append('file', f);
        const res = await fetch(`/api/conversations/${convIdForUpload}/documents`, {
          method: 'POST',
          body: fd,
        });
        const j = await res.json();
        if (!res.ok || !j?.success) {
          const msg = typeof j?.message === 'string' ? j.message : t('docUploadFailed');
          setAttachError(msg);
          continue;
        }
        const d = j.data as ChatDocument & { extractedText: string };
        setDocuments((prev) => [
          ...prev,
          {
            id: localId,
            docId: d.docId,
            name: d.name,
            mime: d.mime,
            url: d.url,
            sizeBytes: d.sizeBytes,
            truncated: d.truncated,
            extractedText: d.extractedText,
          },
        ]);
      } catch (err) {
        setAttachError(err instanceof Error ? err.message : t('docUploadFailed'));
      } finally {
        setUploadingDocs((prev) => prev.filter((id) => id !== localId));
      }
    }
  }

  // M29-E: image / video composer modes inject an optional one-click
  // style preset into the prompt so users don't have to learn the
  // vendor's style cue vocabulary. Image mode covers two paths:
  //   1. capabilities.imageGeneration (OpenAI Responses image_generation
  //      tool offered as a side feature on text models) toggled on.
  //   2. imageNative — the selected model itself is an image generator
  //      (catalog category='image').
  const showVideoStyles = capabilities.video;
  const showImageStyles =
    !showVideoStyles &&
    (imageNative || (capabilities.imageGeneration && options.imageMode));

  function submit() {
    const raw = text.trim();
    if (
      (!raw && attachments.length === 0 && documents.length === 0) ||
      disabled ||
      uploadingDocs.length > 0
    ) {
      return;
    }
    // Apply the selected style prefix to the user prompt.
    let finalText = raw;
    if (showVideoStyles) {
      finalText = applyStylePrefix(raw, findStylePreset('video', options.videoStyle));
    } else if (showImageStyles) {
      finalText = applyStylePrefix(raw, findStylePreset('image', options.imageStyle));
    }
    setText('');
    setAttachments([]);
    setDocuments([]);
    setAttachError(null);
    onSend(finalText, attachments, documents);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-5">
      <div
        className={cn(
          'flex flex-col gap-2 rounded-xl border border-border bg-background px-4 py-3 shadow-[var(--shadow-3)] transition-all duration-200',
          'focus-within:border-foreground/30 focus-within:shadow-[var(--shadow-4)]',
          dragActive && 'border-foreground/40 shadow-[var(--shadow-4)]',
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragActive(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          if (e.dataTransfer.files.length) void ingest(e.dataTransfer.files);
        }}
      >
        {(attachments.length > 0 || documents.length > 0 || uploadingDocs.length > 0) && (
          <div className="flex flex-wrap gap-2 px-1 pt-1">
            {attachments.map((a) => (
              <AttachmentChip
                key={a.id}
                attachment={a}
                onRemove={() => setAttachments((prev) => prev.filter((p) => p.id !== a.id))}
              />
            ))}
            {documents.map((d) => (
              <DocumentChip
                key={d.id}
                doc={d}
                onRemove={() => setDocuments((prev) => prev.filter((p) => p.id !== d.id))}
              />
            ))}
            {uploadingDocs.map((id) => (
              <UploadingDocChip key={id} />
            ))}
          </div>
        )}
        {(showVideoStyles || showImageStyles) && (
          <StylePicker
            kind={showVideoStyles ? 'video' : 'image'}
            value={showVideoStyles ? options.videoStyle : options.imageStyle}
            onChange={(id) =>
              onOptionsChange({
                ...options,
                ...(showVideoStyles
                  ? { videoStyle: id }
                  : { imageStyle: id }),
              })
            }
          />
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            // Image paste support — Cmd+V from screenshots etc.
            const items = Array.from(e.clipboardData?.items ?? []);
            const files = items
              .map((it) => (it.kind === 'file' ? it.getAsFile() : null))
              .filter((f): f is File => !!f);
            if (files.length) {
              e.preventDefault();
              void ingest(files);
            }
          }}
          placeholder={placeholder ?? t('placeholderDefault')}
          rows={1}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter or plain Enter (no shift) submits.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          className="block w-full resize-none border-0 bg-transparent px-1 py-2.5 text-[14px] leading-relaxed placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
          disabled={disabled}
        />
        {attachError && (
          <p className="px-1 text-xs text-destructive">{attachError}</p>
        )}
        <div className="flex items-center justify-between gap-2">
          {/* M30: left toggle row scrolls horizontally on phones so 6+
           *  buttons don't compete with the send button on narrow
           *  viewports. min-w-0 keeps flex from blowing past the
           *  composer's bounds. */}
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto whitespace-nowrap text-muted-foreground [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,.pdf,.docx,.txt,.md"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) void ingest(e.target.files);
                e.target.value = ''; // allow re-selecting the same file
              }}
            />
            {capabilities.vision && !capabilities.video && (
              <ToggleBtn
                active={false}
                label={t('uploadImage')}
                onToggle={() => fileInputRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
              </ToggleBtn>
            )}
            {capabilities.imageGeneration && (
              <ToggleBtn
                active={options.imageMode}
                label={t('imageMode')}
                onToggle={() => onOptionsChange({ ...options, imageMode: !options.imageMode })}
              >
                <ImageIcon className="h-4 w-4" />
              </ToggleBtn>
            )}
            {capabilities.webSearch && (
              <ToggleBtn
                active={options.webSearch}
                label={t('search')}
                onToggle={() => onOptionsChange({ ...options, webSearch: !options.webSearch })}
              >
                <Globe className="h-4 w-4" />
              </ToggleBtn>
            )}
            {/* M31-A: collaboration toggle. Shown for plain chat models;
             *  hidden in image/video/audio modes (those don't compose). */}
            {!capabilities.video && !capabilities.audio && (
              <ToggleBtn
                active={(options.collaborators?.length ?? 0) > 0}
                label={
                  options.collaborators?.length
                    ? tCollab('activeLabel', { n: options.collaborators.length })
                    : tCollab('btn')
                }
                onToggle={() => setCollabOpen(true)}
              >
                <Users className="h-4 w-4" />
              </ToggleBtn>
            )}
            {capabilities.reasoning && (
              <ThinkPicker
                value={options.reasoningEffort}
                efforts={validEfforts}
                onChange={(v) => onOptionsChange({ ...options, reasoningEffort: v })}
              />
            )}
            {capabilities.video && (() => {
              // M38: 用 veoCapabilities 驱动 — 各 Veo 型号支持的 duration /
              // resolution / aspect / lastFrame 都不一样, 见 models-catalog.
              const veo = currentModel ? veoCapabilities(currentModel) : null;
              const durations = (veo?.durations.map((n) => String(n)) ?? ['4', '8', '16']) as VideoDuration[];
              const resolutions = veo?.resolutions ?? (['720p', '1080p'] as const);
              const aspects = veo?.aspects ?? (['16:9', '9:16'] as const);
              const supportsLastFrame = veo?.supportsLastFrame ?? false;
              const sizeFromOpts = options.videoSize ?? '1920x1080';
              // 决定当前 resolution / aspect, 从 size 字符串反查
              const resFromSize = sizeFromOpts.includes('3840')
                ? '4k'
                : sizeFromOpts.includes('1920') || sizeFromOpts.includes('1080')
                  ? '1080p'
                  : '720p';
              const aspectFromSize: '16:9' | '9:16' =
                sizeFromOpts.startsWith('720x') || sizeFromOpts.startsWith('1080x')
                  ? '9:16'
                  : '16:9';
              // 切 resolution / aspect 时重建 size 字符串
              function rebuildSize(res: '720p' | '1080p' | '4k', aspect: '16:9' | '9:16') {
                const map: Record<string, Record<string, VideoSize>> = {
                  '720p':  { '16:9': '1280x720',  '9:16': '720x1280' },
                  '1080p': { '16:9': '1920x1080', '9:16': '1080x1920' },
                  '4k':    { '16:9': '3840x2160', '9:16': '3840x2160' },
                };
                return map[res]?.[aspect] ?? '1920x1080';
              }
              const dur = (options.videoDuration ?? String(durations[0] ?? '8')) as VideoDuration;
              const validDur = durations.includes(dur) ? dur : durations[0]!;
              return (
                <>
                  <DurationPicker
                    value={validDur}
                    options={durations}
                    onChange={(v) => onOptionsChange({ ...options, videoDuration: v })}
                  />
                  <ResolutionPicker
                    value={(resolutions.includes(resFromSize as never) ? resFromSize : resolutions[0]) as '720p' | '1080p' | '4k'}
                    options={resolutions}
                    onChange={(v) =>
                      onOptionsChange({ ...options, videoSize: rebuildSize(v, aspectFromSize) })
                    }
                  />
                  <AspectPicker
                    value={(aspects.includes(aspectFromSize as never) ? aspectFromSize : aspects[0]!) as '16:9' | '9:16'}
                    options={aspects}
                    onChange={(v) =>
                      onOptionsChange({ ...options, videoSize: rebuildSize(resFromSize as never, v) })
                    }
                  />
                  {/* M42-S4: Veo 全系都支持首帧 image-to-video, 显示 FirstFramePicker.
                   *  setvar 'videoFirstFrame', 父传到 buildExtraBody → conv-svc → vendor */}
                  <FirstFramePicker
                    value={options.videoFirstFrame}
                    onChange={(v) => onOptionsChange({ ...options, videoFirstFrame: v })}
                  />
                  {supportsLastFrame && (
                    <LastFramePicker
                      value={options.videoLastFrame}
                      onChange={(v) => onOptionsChange({ ...options, videoLastFrame: v })}
                    />
                  )}
                </>
              );
            })()}
            {capabilities.audio && (
              <VoicePicker
                value={options.audioVoice ?? 'alloy'}
                onChange={(v) => onOptionsChange({ ...options, audioVoice: v })}
              />
            )}
            {imageNative && (() => {
              // M42-S1: image-native 模型 (gpt-image-2 / gemini-*-image) 在
              // chat 流的尺寸/比例/质量 picker. 选项来自 lib/image-models.ts
              // 该模型的 aspects/tiers/qualities, 跟 wizard 同源.
              const cfg = currentModel ? findImageModel(currentModel) : null;
              if (!cfg) return null;
              const aspect = options.imageAspect && cfg.aspects.includes(options.imageAspect)
                ? options.imageAspect
                : cfg.defaultAspect;
              const tier = options.imageTier && cfg.tiers.includes(options.imageTier)
                ? options.imageTier
                : cfg.defaultTier;
              const quality = options.imageQuality && cfg.qualities?.includes(options.imageQuality)
                ? options.imageQuality
                : cfg.defaultQuality;
              return (
                <>
                  <ImageAspectPicker
                    value={aspect}
                    options={cfg.aspects}
                    onChange={(v) => onOptionsChange({ ...options, imageAspect: v })}
                  />
                  <ImageTierPicker
                    value={tier}
                    options={cfg.tiers}
                    onChange={(v) => onOptionsChange({ ...options, imageTier: v })}
                  />
                  {cfg.qualities && cfg.qualities.length > 0 && quality && (
                    <ImageQualityPicker
                      value={quality}
                      options={cfg.qualities}
                      onChange={(v) => onOptionsChange({ ...options, imageQuality: v })}
                    />
                  )}
                  <span
                    className="hidden text-[10px] tabular-nums text-muted-foreground sm:inline"
                    title="最终像素"
                  >
                    {(() => {
                      const r = resolveResolution(aspect, tier);
                      return `${r.w}×${r.h}`;
                    })()}
                  </span>
                </>
              );
            })()}
          </div>
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
              aria-label={t('stopGenerating')}
            >
              <StopCircle className="h-4 w-4" strokeWidth={1.75} />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={
                disabled ||
                rateLimited ||
                uploadingDocs.length > 0 ||
                (!text.trim() && attachments.length === 0 && documents.length === 0)
              }
              data-composer-send
              className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-foreground px-3 text-background transition-all hover:bg-foreground/90 active:scale-95 disabled:opacity-30 disabled:active:scale-100"
              aria-label={
                rateLimited
                  ? t('rateLimitedAria', { sec: retrySecondsLeft })
                  : t('send')
              }
              title={rateLimited ? t('rateLimitedTitle', { sec: retrySecondsLeft }) : undefined}
            >
              {rateLimited ? (
                <span className="font-mono text-[11px]">{retrySecondsLeft}s</span>
              ) : (
                <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
              )}
            </button>
          )}
        </div>
      </div>
      <CollaborationModal
        open={collabOpen}
        onOpenChange={setCollabOpen}
        primaryModel={currentModel ?? ''}
        availableModels={availableModels ?? []}
        current={options.collaborators ?? []}
        onConfirm={(picked) =>
          onOptionsChange({
            ...options,
            collaborators: picked.length > 0 ? picked : undefined,
          })
        }
      />
    </div>
  );
}

/** Read a File into base64 (no data: prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const result = r.result as string;
      // result is "data:image/png;base64,XXXX" — strip the prefix.
      const i = result.indexOf(',');
      resolve(i >= 0 ? result.slice(i + 1) : result);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Tiny preview chip for an attached image — click X to drop it. */
function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: ChatAttachment;
  onRemove: () => void;
}) {
  const t = useTranslations('chat.composer');
  const src = `data:${attachment.mime};base64,${attachment.b64}`;
  return (
    <div className="group relative h-16 w-16 overflow-hidden rounded-md border border-border/60 bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={attachment.name} className="h-full w-full object-cover" />
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-0.5 top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 transition-opacity group-hover:opacity-100"
        aria-label={t('removeAttachment', { name: attachment.name })}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/** Compact chip for an attached document (PDF/DOCX/TXT/MD). Shows the
 *  filename, a tiny size indicator, and a × on hover to drop it. The
 *  truncation badge surfaces server-side cap so users don't wonder why
 *  page 30+ content didn't make it into the answer. */
function DocumentChip({ doc, onRemove }: { doc: ChatDocument; onRemove: () => void }) {
  const t = useTranslations('chat.composer');
  const sizeKB = Math.max(1, Math.round(doc.sizeBytes / 1024));
  return (
    <div className="group relative flex items-center gap-2 rounded-md border border-border/60 bg-muted/50 px-2.5 py-1.5 text-xs">
      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="flex flex-col leading-tight">
        <span className="max-w-[160px] truncate font-medium">{doc.name}</span>
        <span className="text-[10px] text-muted-foreground">
          {sizeKB} KB{doc.truncated ? ` · ${t('truncatedTag')}` : ''}
        </span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 transition-opacity group-hover:opacity-100"
        aria-label={t('removeAttachment', { name: doc.name })}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/** Skeleton chip rendered while a document is uploading + parsing. */
function UploadingDocChip() {
  const t = useTranslations('chat.composer');
  return (
    <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span>{t('docUploading')}</span>
    </div>
  );
}

function ToggleBtn({
  children,
  label,
  active,
  onToggle,
}: {
  children: React.ReactNode;
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('chat.composer');
  return (
    <button
      type="button"
      title={t('toggleTitle', { label, state: active ? t('toggleOn') : t('toggleOff') })}
      aria-label={label}
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-all duration-150',
        active
          ? 'bg-foreground text-background'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/**
 * M27: video duration picker. Cycles 4 → 8 → 16 → 4 on click. Veo
 * accepts continuous values upstream but exposing exactly three tiers
 * keeps the UI uncluttered; we always emit a value (default '8' is
 * applied by the parent before the first click) so the upstream never
 * has to fall back to a server default that might change.
 */
/**
 * M29-I: TTS voice cycle. Same shape as DurationPicker — single
 * button cycles `alloy → coral → echo → nova → shimmer → alloy`.
 * Voice list matches Azure gpt-4o-mini-tts's most-used presets.
 */
function VoicePicker({
  value,
  onChange,
}: {
  value: AudioVoice;
  onChange: (v: AudioVoice) => void;
}) {
  const t = useTranslations('chat.composer');
  function cycle() {
    const idx = AUDIO_VOICES.indexOf(value);
    const next = AUDIO_VOICES[(idx + 1) % AUDIO_VOICES.length]!;
    onChange(next);
  }
  return (
    <button
      type="button"
      title={t('audioVoiceTitle', { voice: value })}
      aria-label={t('audioVoiceAria', { voice: value })}
      onClick={cycle}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors',
        'bg-accent text-ink hover:bg-accent/80',
      )}
    >
      <AudioLines className="h-4 w-4" />
      <span className="hidden sm:inline">{value}</span>
    </button>
  );
}

function DurationPicker({
  value,
  options,
  onChange,
}: {
  value: VideoDuration;
  /** M38: 列表从 catalog veo.durations 来, 各 Veo 型号支持的时长不一样 */
  options: readonly VideoDuration[];
  onChange: (v: VideoDuration) => void;
}) {
  const t = useTranslations('chat.composer');
  const list = options.length > 0 ? options : VIDEO_DURATIONS;
  function cycle() {
    const idx = list.indexOf(value);
    const next = list[(idx + 1) % list.length]!;
    onChange(next);
  }
  return (
    <button
      type="button"
      title={t('videoDurationTitle', { sec: value })}
      aria-label={t('videoDurationAria', { sec: value })}
      onClick={cycle}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors',
        'bg-accent text-ink hover:bg-accent/80',
      )}
    >
      <Clapperboard className="h-4 w-4" />
      <span className="hidden sm:inline">{t('videoDuration', { sec: value })}</span>
    </button>
  );
}

/** M38: Veo resolution cycle (720p/1080p/4K) + aspect cycle (16:9/9:16). 跟
 *  DurationPicker 同款交互. options 列表按 catalog veo.resolutions 来,
 *  4K 不在列表时自动不出现 (lite + Veo 3.0). */
function ResolutionPicker({
  value,
  options,
  onChange,
}: {
  value: '720p' | '1080p' | '4k';
  options: ReadonlyArray<'720p' | '1080p' | '4k'>;
  onChange: (v: '720p' | '1080p' | '4k') => void;
}) {
  const t = useTranslations('chat.composer');
  function cycle() {
    const idx = options.indexOf(value);
    const next = options[(idx + 1) % options.length]!;
    onChange(next);
  }
  return (
    <button
      type="button"
      title={t('videoResolutionTitle', { res: value })}
      aria-label={t('videoResolutionAria', { res: value })}
      onClick={cycle}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors tabular-nums',
        'bg-accent text-ink hover:bg-accent/80',
      )}
    >
      <Maximize2 className="h-4 w-4" />
      <span className="hidden sm:inline">{value.toUpperCase()}</span>
    </button>
  );
}

function AspectPicker({
  value,
  options,
  onChange,
}: {
  value: '16:9' | '9:16';
  options: ReadonlyArray<'16:9' | '9:16'>;
  onChange: (v: '16:9' | '9:16') => void;
}) {
  const t = useTranslations('chat.composer');
  function cycle() {
    const idx = options.indexOf(value);
    const next = options[(idx + 1) % options.length]!;
    onChange(next);
  }
  return (
    <button
      type="button"
      title={t('videoAspectTitle', { aspect: value })}
      aria-label={t('videoAspectAria', { aspect: value })}
      onClick={cycle}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors tabular-nums',
        'bg-accent text-ink hover:bg-accent/80',
      )}
    >
      <Ratio className="h-4 w-4" />
      <span className="hidden sm:inline">{value}</span>
    </button>
  );
}

/** M42-S4 · Veo 首帧 picker (image-to-video). Veo 全系都支持把一张图
 *  作为视频起始帧, vendor adaptor.go 读 instance.Image. 跟 LastFramePicker
 *  同款交互 — 单按钮点击上传 / 重点表示已设. UI 上首帧在前尾帧在后. */
function FirstFramePicker({
  value,
  onChange,
}: {
  value: VideoLastFrameImage | null | undefined;
  onChange: (v: VideoLastFrameImage | null) => void;
}) {
  const t = useTranslations('chat.composer');
  const inputRef = useRef<HTMLInputElement | null>(null);
  async function handleFile(f: File) {
    if (f.size > MAX_FILE_BYTES) {
      toast.error(t('fileTooLarge', { mb: 8 }));
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? ''));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(f);
      });
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return;
      onChange({ mimeType: m[1]!, bytesBase64Encoded: m[2]! });
    } catch {
      /* ignore */
    }
  }
  return (
    <>
      <button
        type="button"
        title={value ? t('videoFirstFrameSet') : t('videoFirstFrameEmpty')}
        aria-label={t('videoFirstFrameAria')}
        onClick={() => {
          if (value) {
            onChange(null);
          } else {
            inputRef.current?.click();
          }
        }}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors',
          value
            ? 'bg-primary text-primary-foreground'
            : 'bg-accent text-ink hover:bg-accent/80',
        )}
      >
        <Camera className="h-4 w-4" />
        <span className="hidden sm:inline">
          {value ? t('videoFirstFrameLabelSet') : t('videoFirstFrameLabel')}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />
    </>
  );
}

/** M38: 上传"结束帧"图作为 Veo 3.1 首尾帧的尾帧. 起始帧走 ChatComposer
 *  现有 multimodal attachment 路径 (会自动带到 instance.Image). 这里
 *  只管 lastFrame. */
function LastFramePicker({
  value,
  onChange,
}: {
  value: VideoLastFrameImage | null | undefined;
  onChange: (v: VideoLastFrameImage | null) => void;
}) {
  const t = useTranslations('chat.composer');
  const inputRef = useRef<HTMLInputElement | null>(null);
  async function handleFile(f: File) {
    if (f.size > MAX_FILE_BYTES) {
      toast.error(t('fileTooLarge', { mb: 8 }));
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? ''));
        r.onerror = () => reject(r.error);
        r.readAsDataURL(f);
      });
      // dataUrl = "data:image/png;base64,XXX..." → 拆 mime + base64
      const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!m) return;
      onChange({ mimeType: m[1]!, bytesBase64Encoded: m[2]! });
    } catch {
      // ignore
    }
  }
  return (
    <>
      <button
        type="button"
        title={value ? t('videoLastFrameSet') : t('videoLastFrameEmpty')}
        aria-label={t('videoLastFrameAria')}
        onClick={() => {
          if (value) {
            onChange(null);
          } else {
            inputRef.current?.click();
          }
        }}
        className={cn(
          'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors',
          value
            ? 'bg-primary text-primary-foreground'
            : 'bg-accent text-ink hover:bg-accent/80',
        )}
      >
        <Film className="h-4 w-4" />
        <span className="hidden sm:inline">
          {value ? t('videoLastFrameLabelSet') : t('videoLastFrameLabel')}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />
    </>
  );
}

/** M42-S1 · image-native picker 三件套. cycle 模式同 DurationPicker —
 *  单 button 点击循环 (aspect → tier → quality 各一档). 选项列表由父
 *  传入, 来自 findImageModel(currentModel) 的 aspects/tiers/qualities. */
function ImageAspectPicker({
  value,
  options,
  onChange,
}: {
  value: AspectRatio;
  options: ReadonlyArray<AspectRatio>;
  onChange: (v: AspectRatio) => void;
}) {
  function cycle() {
    const idx = options.indexOf(value);
    onChange(options[(idx + 1) % options.length]!);
  }
  return (
    <button
      type="button"
      title={`图像比例 ${value}（点击切换）`}
      aria-label={`图像比例 ${value}`}
      onClick={cycle}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors tabular-nums',
        'bg-accent text-ink hover:bg-accent/80',
      )}
    >
      <Ratio className="h-4 w-4" />
      <span className="hidden sm:inline">{value}</span>
    </button>
  );
}

function ImageTierPicker({
  value,
  options,
  onChange,
}: {
  value: Tier;
  options: ReadonlyArray<Tier>;
  onChange: (v: Tier) => void;
}) {
  function cycle() {
    const idx = options.indexOf(value);
    onChange(options[(idx + 1) % options.length]!);
  }
  return (
    <button
      type="button"
      title={`分辨率档位 ${value}（点击切换）`}
      aria-label={`分辨率档位 ${value}`}
      onClick={cycle}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors tabular-nums',
        'bg-accent text-ink hover:bg-accent/80',
      )}
    >
      <Maximize2 className="h-4 w-4" />
      <span className="hidden sm:inline">{value}</span>
    </button>
  );
}

function ImageQualityPicker({
  value,
  options,
  onChange,
}: {
  value: ImageQuality;
  options: ReadonlyArray<ImageQuality>;
  onChange: (v: ImageQuality) => void;
}) {
  const labels: Record<ImageQuality, string> = { low: '快', medium: '中', high: '精' };
  function cycle() {
    const idx = options.indexOf(value);
    onChange(options[(idx + 1) % options.length]!);
  }
  return (
    <button
      type="button"
      title={`图像质量 ${value}（点击切换）`}
      aria-label={`图像质量 ${value}`}
      onClick={cycle}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors',
        'bg-accent text-ink hover:bg-accent/80',
      )}
    >
      <ImageIcon className="h-4 w-4" />
      <span className="hidden sm:inline">{labels[value]}</span>
    </button>
  );
}

const ALL_EFFORTS: readonly ReasoningEffort[] = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];

/**
 * Reasoning depth picker. Cycles through `null → e1 → e2 → … → null`,
 * where the effort list is supplied per-model by the parent (some models
 * — e.g. gpt-5.4-pro — only accept a subset). Off = don't send the field.
 */
function ThinkPicker({
  value,
  onChange,
  efforts,
}: {
  value: ReasoningEffort | null;
  onChange: (v: ReasoningEffort | null) => void;
  efforts?: readonly ReasoningEffort[];
}) {
  const t = useTranslations('chat.composer');
  const labels: Record<ReasoningEffort, string> = {
    minimal: t('thinkingShortMinimal'),
    low: t('thinkingShortLow'),
    medium: t('thinkingShortMedium'),
    high: t('thinkingShortHigh'),
    xhigh: t('thinkingShortXhigh'),
  };
  const order = efforts && efforts.length > 0 ? efforts : ALL_EFFORTS;
  const active = value !== null;
  function cycle() {
    if (value === null) return onChange(order[0] ?? null);
    const idx = order.indexOf(value);
    // Unknown current value (e.g. switched models) → reset to off, parent
    // will re-enter the list on the next click.
    if (idx === -1) return onChange(null);
    if (idx === order.length - 1) return onChange(null);
    return onChange(order[idx + 1]!);
  }
  return (
    <button
      type="button"
      title={active ? t('thinkingPickerTitle', { level: labels[value] }) : t('thinkingPickerOff')}
      aria-pressed={active}
      onClick={cycle}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition-colors',
        active
          ? 'bg-accent text-ink hover:bg-accent/80'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <Brain className="h-4 w-4" />
      <span className="hidden sm:inline">{t('thinkingShort')}{active ? `·${labels[value]}` : ''}</span>
    </button>
  );
}
