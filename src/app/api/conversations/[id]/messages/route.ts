import { NextResponse } from 'next/server';
import { ensureSameOrigin } from '@/lib/bff';
import { convFetch, convStreamFetch } from '@/lib/conv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET — list messages of a conversation (chronological). */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const r = await convFetch(`/v1/conversations/${encodeURIComponent(id)}/messages${url.search}`);
  return NextResponse.json(r);
}

/**
 * DELETE — truncate messages from `from` (inclusive) onward. Used by the
 * client for delete / regenerate / edit-and-resend flows.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const r = await convFetch(
    `/v1/conversations/${encodeURIComponent(id)}/messages${url.search}`,
    { method: 'DELETE' },
  );
  return NextResponse.json(r);
}

/**
 * POST — send a new user message; SSE-streams the assistant reply.
 *
 * Buffers the JSON request body (small — text + at most a few MB of base64
 * images) before calling conv-svc, then pipes the upstream SSE response
 * stream straight back to the browser. We don't transform the body so the
 * client's existing OpenAI SSE parser keeps working.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;
  const { id } = await ctx.params;

  const body = await req.arrayBuffer();
  const upstream = await convStreamFetch(
    `/v1/conversations/${encodeURIComponent(id)}/messages`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    },
  );

  // M32-2.A: forward Retry-After (only meaningful on 429) so the web
  // client can render a countdown instead of a generic toast.
  const headers: Record<string, string> = {
    'content-type': upstream.headers.get('content-type') ?? 'application/json',
    'cache-control': 'no-cache, no-transform',
    'x-accel-buffering': 'no',
  };
  const retryAfter = upstream.headers.get('retry-after');
  if (retryAfter) headers['retry-after'] = retryAfter;

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}
