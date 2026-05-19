import { MarkdownContent } from '@/components/chat/MarkdownContent';
import { VendorMonogram } from '@/components/chat/VendorMonogram';
import { cn } from '@/lib/utils';

/**
 * Read-only transcript renderer for the public /share/[token] page.
 *
 * Deliberately separate from `<MessageList>` — that component is wired
 * to streaming, edit/regenerate/delete actions, branch switching, video
 * task polling, and live image generation. None of those make sense
 * for a snapshot viewed by an anonymous reader, and bolting a
 * `readonly` flag onto MessageList would mean threading "skip this"
 * through ~10 sub-components for no real reuse.
 *
 * What we render here is the minimum to make the chat readable:
 *   - role-aware bubble (user right-aligned, assistant full-width)
 *   - markdown for assistant text
 *   - one-line indicators for attachments / docs / generated images /
 *     video tasks so the reader knows the original turn included them
 *     (not a viewer; live downloads would expose private files)
 */
export type SharedMessage = {
  id: number;
  role: 'user' | 'assistant';
  content: {
    text?: string;
    attachments?: Array<{ mime: string; b64: string; name: string }>;
    documents?: Array<{ name: string; mime: string }>;
    generatedImages?: Array<{ url: string; prompt?: string }>;
    videoTask?: { model: string; status: string; durationSeconds?: number };
  };
  model: string | null;
  createdAt: string;
};

export function SharedMessageList({ messages }: { messages: SharedMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed bg-card/50 px-6 py-16 text-center text-sm text-muted-foreground">
        （这是一段空对话）
      </div>
    );
  }
  return (
    <div className="space-y-8">
      {messages.map((m) => {
        const isUser = m.role === 'user';
        return (
          <div
            key={m.id}
            className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}
          >
            <div className={cn('flex w-full gap-3', isUser ? 'justify-end' : 'justify-start')}>
              {!isUser && (
                <div className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground sm:flex">
                  <VendorMonogram model={m.model || ''} size={20} />
                </div>
              )}
              <div
                className={cn(
                  'text-sm leading-relaxed',
                  isUser
                    ? 'max-w-[70%] rounded-2xl bg-muted px-4 py-3 text-foreground'
                    : 'w-full max-w-none px-1',
                )}
              >
                {(m.content.attachments?.length ?? 0) > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    {m.content.attachments!.map((a, i) => (
                      <span
                        key={i}
                        className="rounded-md border bg-card px-2 py-0.5"
                      >
                        附件 · {a.name || a.mime}
                      </span>
                    ))}
                  </div>
                )}
                {(m.content.documents?.length ?? 0) > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    {m.content.documents!.map((d, i) => (
                      <span
                        key={i}
                        className="rounded-md border bg-card px-2 py-0.5"
                      >
                        文档 · {d.name}
                      </span>
                    ))}
                  </div>
                )}
                {(m.content.generatedImages?.length ?? 0) > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                    {m.content.generatedImages!.map((g, i) => (
                      <span
                        key={i}
                        className="rounded-md border bg-card px-2 py-0.5"
                      >
                        生成图 · {g.prompt ?? `image ${i + 1}`}
                      </span>
                    ))}
                  </div>
                )}
                {m.content.videoTask && (
                  <div className="mb-2 inline-flex rounded-md border bg-card px-2 py-0.5 text-xs text-muted-foreground">
                    生成视频 · {m.content.videoTask.model} ·{' '}
                    {m.content.videoTask.status}
                    {m.content.videoTask.durationSeconds
                      ? ` · ${m.content.videoTask.durationSeconds}s`
                      : ''}
                  </div>
                )}
                {m.content.text ? (
                  isUser ? (
                    <div className="whitespace-pre-wrap break-words">
                      {m.content.text}
                    </div>
                  ) : (
                    <MarkdownContent content={m.content.text} />
                  )
                ) : (
                  <span className="text-muted-foreground italic">
                    （无文本内容）
                  </span>
                )}
              </div>
            </div>
            {!isUser && m.model && (
              <span className="self-start pl-11 text-[11px] text-muted-foreground">
                {m.model}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
