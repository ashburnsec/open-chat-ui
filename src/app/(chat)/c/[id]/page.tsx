import { notFound, redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { getStatus } from '@/lib/status';
import { newapi } from '@/lib/newapi';
import { convFetch, type ConvMessage, type Conversation } from '@/lib/conv';
import { ChatPanel, type ChatPanelAgent } from '@/components/chat/ChatPanel';
import { WizardCanvas } from '@/components/workflow/WizardCanvas';
import type { ChatMessage } from '@/hooks/use-chat-stream';
import { resolveModelId } from '@/lib/models-catalog';

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect('/auth/sign-in' as never);
  const status = await getStatus();

  const [convRes, msgRes] = await Promise.all([
    convFetch<Conversation>(`/v1/conversations/${encodeURIComponent(id)}`),
    convFetch<{ items: ConvMessage[] }>(
      `/v1/conversations/${encodeURIComponent(id)}/messages?limit=200`,
    ),
  ]);
  if (!convRes.success || !convRes.data) notFound();

  // M36: wizard 类对话 (一键生图 等 mini-app) 主区分流到 WizardCanvas,
  // chrome (sidebar/TopNav/(chat)/layout) 仍是外层包裹.
  if (convRes.data.wizardMetadata?.kind === 'image-gen') {
    return (
      <WizardCanvas
        conversation={convRes.data}
        initialMessages={(msgRes.data?.items ?? []).map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content as Record<string, unknown> | null,
        }))}
      />
    );
  }

  const modelsRes = await newapi<string[]>('/api/user/models');
  const models = modelsRes.success && Array.isArray(modelsRes.data) ? modelsRes.data : [];

  // M13: if conv was bound to an agent, fetch its display info so the
  // ChatPanel header can render the badge. We look up by id via the
  // list endpoint (cheap — list is unpaginated and small) since the
  // GET-by-slug needs a slug we haven't loaded.
  let agent: ChatPanelAgent | null = null;
  if (convRes.data.agentId != null) {
    const agentsList = await convFetch<{
      items: Array<{ id: number; slug: string; name: string; avatar: string }>;
    }>('/v1/agents');
    if (agentsList.success && agentsList.data?.items) {
      const found = agentsList.data.items.find((a) => a.id === convRes.data!.agentId);
      if (found) {
        agent = { id: found.id, slug: found.slug, name: found.name, avatar: found.avatar };
      }
    }
  }

  // Hydrate the in-memory transcript with persisted messages.
  // M17-P1b: items now come pre-sorted as the active branch only — no
  // need to filter alternative branches client-side.
  const initialMessages: ChatMessage[] = (msgRes.data?.items ?? []).map((m) => ({
    id: String(m.id),
    dbId: m.id,
    role: m.role === 'tool' ? 'assistant' : m.role,
    content: m.content?.text ?? '',
    reasoning: m.reasoning ?? undefined,
    attachments: m.content?.attachments?.map((a, i) => ({
      id: `${m.id}-${i}`,
      mime: a.mime,
      b64: a.b64,
      name: a.name,
    })),
    generatedImages: m.content?.generatedImages,
    // M27: hydrate the Veo task envelope so a page refresh during a
    // running generation lands back in the same poll loop. For
    // already-completed tasks this paints the player + download
    // button immediately without a network round-trip.
    videoTask: m.content?.videoTask
      ? {
          ...m.content.videoTask,
          // Re-derive the BFF URL on hydration in case the persisted
          // value is stale (different deployment / path change).
          videoUrl:
            m.content.videoTask.status === 'completed'
              ? `/api/files/videos/${encodeURIComponent(m.content.videoTask.taskId)}`
              : m.content.videoTask.videoUrl,
        }
      : undefined,
    // M17-P2: doc chips on resume. extractedText isn't preserved (model
    // already saw it last time) — chip-only display.
    documents: m.content?.documents?.map((d) => ({
      id: d.docId,
      docId: d.docId,
      name: d.name,
      mime: d.mime,
      url: d.url,
      sizeBytes: d.sizeBytes,
      truncated: d.truncated,
      extractedText: '',
    })),
    siblingCount: m.siblingCount,
    siblingIndex: m.siblingIndex,
    siblingIds: m.siblingIds,
    // M31-A: hydrate the per-collaborator breakdown so the "show N
    // original answers" panel works on a resumed conv too.
    collaborationDetails: m.content?.collaborationDetails,
    // M24: backfill the cost-badge metadata from persisted columns so
    // the badge renders on resume, not just on freshly streamed turns.
    // Only assistant rows that actually billed (model + at least one
    // prompt token) qualify — user/system rows have no badge.
    usage:
      m.role === 'assistant' && m.model && (m.promptTokens ?? 0) > 0
        ? {
            promptTokens: m.promptTokens ?? 0,
            completionTokens: m.completionTokens ?? 0,
            model: m.model,
          }
        : undefined,
  }));

  return (
    // M41 A1: key={convId} 让 /c/[a] → /c/[b] / → /welcome 全部 force remount
    // ChatPanel, 不复用 React Fiber state. 之前 user 报 "点新建对话 URL 变
    // /welcome 但旧对话内容还在" 的根因
    <ChatPanel
      key={`c-${convRes.data.id}`}
      user={user}
      status={status}
      models={models}
      conversationId={convRes.data.id}
      conversationModel={resolveModelId(convRes.data.model)}
      conversationAgent={agent}
      conversationDefaultParams={convRes.data.defaultParams ?? null}
      initialMessages={initialMessages}
    />
  );
}
