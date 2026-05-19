/**
 * Server-only helper for calling conversation-service from webapp BFF
 * routes and Server Components.
 *
 * conv-service expects two custom headers (see auth middleware there):
 *   X-NewApi-Cookie : the upstream session cookie pair, as the browser
 *                     stored it (Next decodes URL-encoded values for us)
 *   X-NewApi-Uid    : the cached user id from the `uid` cookie
 *
 * This wrapper lifts both off the request automatically.
 */
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, UID_COOKIE_NAME } from './cookie';
import type { WizardMetadata } from './wizard-types';

const CONV_URL = process.env.CONV_SERVICE_URL ?? 'http://localhost:4000';

export type ConvResp<T> = {
  success: boolean;
  message: string;
  data?: T;
};

export async function convFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<ConvResp<T>> {
  // Mock mode: short-circuit to local fixtures (no real conv-service).
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true') {
    const { mockConvFetch } = await import('@/mocks/server');
    return mockConvFetch<T>(path, init);
  }
  const store = await cookies();
  const session = store.get(SESSION_COOKIE_NAME)?.value;
  const uid = store.get(UID_COOKIE_NAME)?.value;
  if (!session || !uid) {
    return { success: false, message: 'not authenticated' };
  }
  const res = await fetch(`${CONV_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-NewApi-Cookie': `${SESSION_COOKIE_NAME}=${session}`,
      'X-NewApi-Uid': uid,
      ...init.headers,
    },
    cache: 'no-store',
  } as RequestInit & { cache: RequestCache });
  return res.json() as Promise<ConvResp<T>>;
}

/**
 * Stream-friendly variant for the SSE message-post endpoint. Forwards the
 * raw upstream body byte-for-byte instead of trying to JSON-parse it.
 */
export async function convStreamFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  // Mock mode: stream a fake LLM SSE response.
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true') {
    const { mockSSEStream } = await import('@/mocks/sse');
    const { MOCK_CHAT_RESPONSES } = await import('@/mocks/data');
    const pick = MOCK_CHAT_RESPONSES[Math.floor(Math.random() * MOCK_CHAT_RESPONSES.length)];
    return mockSSEStream(pick);
  }
  const store = await cookies();
  const session = store.get(SESSION_COOKIE_NAME)?.value;
  const uid = store.get(UID_COOKIE_NAME)?.value;
  if (!session || !uid) {
    return new Response(JSON.stringify({ success: false, message: 'not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return fetch(`${CONV_URL}${path}`, {
    ...init,
    headers: {
      'X-NewApi-Cookie': `${SESSION_COOKIE_NAME}=${session}`,
      'X-NewApi-Uid': uid,
      ...init.headers,
    },
  });
}

// ----- Typed shapes (mirror conv-svc) -----
/** M17-P1a: composer toggles snapshotted onto a conversation at creation
 *  time. Subset of ComposerOptions; arbitrary keys are filtered server-side. */
export type ConversationDefaultParams = {
  webSearch?: boolean;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | null;
  imageMode?: boolean;
};

export type Conversation = {
  id: string;
  userId: number;
  title: string;
  model: string;
  systemPrompt: string | null;
  /** M13: optional agent binding. Conversation snapshots system_prompt
   *  at creation so the agent reference is just for UI display. */
  agentId: number | null;
  /** M17-P1a: snapshot of agent.default_params at creation. NULL when no
   *  agent or agent had no preset. Used to seed ComposerOptions on resume. */
  defaultParams: ConversationDefaultParams | null;
  pinned: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** M36: 一键生图 mini-app metadata. NULL on plain chat conversations. */
  wizardMetadata?: WizardMetadata | null;
};

export type ConvMessage = {
  id: number;
  conversationId: string;
  role: 'system' | 'user' | 'assistant' | 'tool';
  // conv-svc stores `{ raw, text, attachments, generatedImages? }` shape;
  // we surface the display-friendly fields here. `generatedImages` (M16)
  // appears on assistant turns when the built-in image_generation tool ran.
  content: {
    raw?: unknown;
    text?: string;
    attachments?: { mime: string; b64: string; name: string }[];
    generatedImages?: { url: string; prompt?: string; size?: string; quality?: string }[];
    /** M17-P2: doc references attached to a user turn. The extractedText
     *  is omitted here on purpose — replaying the conv only needs the
     *  display chip; the model already saw the text in the original turn. */
    documents?: Array<{
      docId: string;
      name: string;
      mime: string;
      sizeBytes: number;
      truncated?: boolean;
      kind: string;
      url: string;
    }>;
    /** M27: persisted Veo task envelope. Hydrate-only here — VideoCard
     *  re-attaches the polling hook on resume so a still-running task
     *  finishes its progress bar in the bubble it landed in originally. */
    videoTask?: {
      taskId: string;
      model: string;
      prompt: string;
      status: 'queued' | 'in_progress' | 'completed' | 'failed';
      progress?: number;
      videoUrl?: string;
      errorMessage?: string;
      submittedAt: number;
      completedAt?: number;
      durationSeconds?: number;
    };
    /** M31-A: per-collaborator breakdown persisted by handleCollaboration.
     *  On page resume, hydrate each detail onto the assistant message so
     *  the "show N original answers" panel still works. */
    collaborationDetails?: Array<{
      model: string;
      content: string;
      promptTokens?: number;
      completionTokens?: number;
      durationMs?: number;
      error?: string;
    }>;
  };
  reasoning: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  requestId: string | null;
  /** M17-P1b: predecessor in the branch chain (NULL on root rows). */
  parentId: number | null;
  /** M17-P1b: count of sibling branches sharing this row's parent. */
  siblingCount: number;
  siblingIndex: number;
  /** Sibling row ids, sorted ASC. siblingIds[siblingIndex] === id. */
  siblingIds: number[];
  createdAt: string;
};
