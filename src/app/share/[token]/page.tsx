import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolveBrand } from '@/lib/brand';
import { getStatus } from '@/lib/status';
import {
  SharedMessageList,
  type SharedMessage,
} from '@/components/share/SharedMessageList';

export const dynamic = 'force-dynamic';

/**
 * Public read-only share page for a conversation. Renders without auth —
 * the UUID share token in the URL is the credential.
 *
 * Tells crawlers explicitly NOT to index. Even though tokens aren't
 * guessable, an indexed share page would leak conv content via search
 * snippets — `noindex,nofollow` keeps the URL "private by obscurity".
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

type ShareResp = {
  success: boolean;
  message?: string;
  data?: {
    conversation: {
      convId: string;
      title: string;
      model: string;
      createdAt: string;
    };
    messages: SharedMessage[];
  };
};

const CONV_URL = process.env.CONV_SERVICE_URL ?? 'http://localhost:4000';

async function fetchShare(token: string): Promise<ShareResp | null> {
  try {
    const r = await fetch(
      `${CONV_URL}/v1/share/${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    );
    if (!r.ok) return null;
    return (await r.json()) as ShareResp;
  } catch {
    return null;
  }
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [share, status] = await Promise.all([fetchShare(token), getStatus()]);
  if (!share?.success || !share.data) {
    notFound();
  }
  const { conversation, messages } = share.data;
  const brand = resolveBrand(status.system_name);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between px-4 sm:px-6">
          <a
            href="/"
            className="font-display text-lg font-semibold tracking-tight"
          >
            {brand}
          </a>
          <span className="text-xs text-muted-foreground">
            只读分享 · Read-only share
          </span>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {conversation.title || '未命名会话'}
          </h1>
          <div className="mt-1 text-xs text-muted-foreground">
            {conversation.model && (
              <span className="mr-2 rounded-full border bg-card px-2 py-0.5">
                {conversation.model}
              </span>
            )}
            <time dateTime={conversation.createdAt}>
              {new Date(conversation.createdAt).toLocaleString()}
            </time>
            <span className="mx-2 opacity-50">·</span>
            <span>{messages.length} 条消息</span>
          </div>

          <hr className="my-6 border-border/60" />

          <SharedMessageList messages={messages} />

          <div className="mt-12 rounded-2xl border bg-card p-5 text-center">
            <p className="text-sm text-muted-foreground">
              这段对话由 {brand} 生成 · 想试试和 AI 聊天？
            </p>
            <a
              href="/"
              className="mt-3 inline-flex items-center justify-center rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              免费开始对话
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
