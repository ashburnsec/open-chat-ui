import type { Conversation, ConvMessage } from '@/lib/conv';

export type ExportLabels = {
  /** Header sub-line: "模型：{model} · 创建：{date} · 共 {n} 条" */
  meta: (vars: { model: string; createdAt: string; count: number }) => string;
  /** Section heading prefix for user turns. */
  user: string;
  /** Section heading prefix for assistant turns; appended with " · {model}". */
  assistant: string;
  /** Token usage line, e.g. "tokens: 320 / 480". */
  tokens: (vars: { prompt: number; completion: number }) => string;
  /** Placeholder text for empty assistant content (e.g. video-only turn). */
  emptyAssistant: string;
};

const DEFAULT_LABELS: ExportLabels = {
  meta: ({ model, createdAt, count }) =>
    `模型：${model || '未指定'} · 创建：${createdAt} · 共 ${count} 条消息`,
  user: '你',
  assistant: '助手',
  tokens: ({ prompt, completion }) => `tokens: ${prompt} / ${completion}`,
  emptyAssistant: '_（无文本内容）_',
};

/**
 * Build a Markdown document from a conversation + its messages.
 *
 * Pure string concatenation, no DOM. Caller is responsible for triggering
 * the browser download — see `downloadMarkdown`. Attachments/images/videos
 * are NOT inlined (would explode file size with base64); we just note their
 * presence with a one-line indicator.
 */
export function buildMarkdown(
  conv: Pick<Conversation, 'title' | 'model' | 'createdAt'>,
  messages: ConvMessage[],
  labels: ExportLabels = DEFAULT_LABELS,
): string {
  const lines: string[] = [];
  const title = conv.title?.trim() || '未命名会话';
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(
    `> ${labels.meta({
      model: conv.model || '',
      createdAt: formatTime(conv.createdAt),
      count: messages.length,
    })}`,
  );
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const m of messages) {
    if (m.role === 'system') continue;

    const ts = formatTime(m.createdAt);
    if (m.role === 'user') {
      lines.push(`## ${labels.user} · ${ts}`);
    } else if (m.role === 'assistant') {
      const modelLabel = m.model ? ` · ${m.model}` : '';
      lines.push(`## ${labels.assistant}${modelLabel} · ${ts}`);
    } else {
      // tool / other — use role as-is
      lines.push(`## ${m.role} · ${ts}`);
    }
    lines.push('');

    const body = renderMessageBody(m, labels);
    lines.push(body);
    lines.push('');

    if (
      m.role === 'assistant' &&
      typeof m.promptTokens === 'number' &&
      typeof m.completionTokens === 'number' &&
      (m.promptTokens > 0 || m.completionTokens > 0)
    ) {
      lines.push(
        `> ${labels.tokens({
          prompt: m.promptTokens,
          completion: m.completionTokens,
        })}`,
      );
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  return lines.join('\n');
}

function renderMessageBody(m: ConvMessage, labels: ExportLabels): string {
  const parts: string[] = [];
  const text = (m.content?.text ?? '').trim();
  if (text) parts.push(text);

  const atts = m.content?.attachments ?? [];
  if (atts.length > 0) {
    parts.push('');
    parts.push(
      atts
        .map((a) => `*[附件] ${a.name || a.mime || 'file'} (${a.mime || ''})*`)
        .join('\n'),
    );
  }

  const docs = m.content?.documents ?? [];
  if (docs.length > 0) {
    parts.push('');
    parts.push(
      docs
        .map((d) => `*[文档] ${d.name} (${d.mime})${d.truncated ? ' — 已截断' : ''}*`)
        .join('\n'),
    );
  }

  const imgs = m.content?.generatedImages ?? [];
  if (imgs.length > 0) {
    parts.push('');
    parts.push(
      imgs
        .map((g, i) => `*[生成图 ${i + 1}]${g.prompt ? ` ${g.prompt}` : ''}*`)
        .join('\n'),
    );
  }

  const v = m.content?.videoTask;
  if (v) {
    parts.push('');
    parts.push(
      `*[生成视频] ${v.model} · ${v.status}${
        v.durationSeconds ? ` · ${v.durationSeconds}s` : ''
      }${v.errorMessage ? ` · ${v.errorMessage}` : ''}*`,
    );
  }

  if (m.reasoning && m.role === 'assistant') {
    parts.push('');
    parts.push('<details><summary>思考过程</summary>');
    parts.push('');
    parts.push(m.reasoning);
    parts.push('');
    parts.push('</details>');
  }

  const out = parts.join('\n').trim();
  return out || labels.emptyAssistant;
}

/**
 * Slug for use in a download filename. Keeps unicode word chars + spaces,
 * collapses runs of unsafe chars to '-', trims to 60 chars. Falls back to
 * "conversation" when the title is empty after slugging.
 */
export function slugifyTitle(title: string): string {
  const cleaned = (title || '')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned || 'conversation';
}

/**
 * yyyymmdd-hhmm in local time, suitable for a filename suffix.
 */
export function timestampSuffix(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

export function buildExportFilename(title: string, d: Date = new Date()): string {
  return `${slugifyTitle(title)}-${timestampSuffix(d)}.md`;
}

/**
 * Browser-only — turn the markdown into a Blob and trigger a download.
 * Safe to call in event handlers; no-op on the server.
 */
export function downloadMarkdown(filename: string, markdown: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * yyyy-mm-dd HH:MM in local time. Empty string for invalid dates.
 */
function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
