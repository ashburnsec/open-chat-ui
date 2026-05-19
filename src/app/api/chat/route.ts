import { cookies } from 'next/headers';
import { NEWAPI_INTERNAL_URL, ensureSameOrigin } from '@/lib/bff';
import { SESSION_COOKIE_NAME, UID_COOKIE_NAME } from '@/lib/cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/chat
 *
 * Pipes an OpenAI-compatible chat completion through new-api's
 * `/pg/chat/completions` (the playground path — session-cookie auth, quota
 * deducted from the user's wallet).
 *
 * Streaming: forwards the upstream SSE response body byte-for-byte. The
 * client parses the standard OpenAI `data: {...}\n\n` chunks (and final
 * `data: [DONE]`) itself — no Vercel AI SDK Data Stream wrapping.
 *
 * For M3 there's no conversation persistence — `messages` is built entirely
 * client-side. M4 redirects this through conversation-service which adds
 * persistence + memory injection between us and new-api.
 */
export async function POST(req: Request) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;

  const store = await cookies();
  const session = store.get(SESSION_COOKIE_NAME)?.value;
  const uid = store.get(UID_COOKIE_NAME)?.value;
  if (!session || !uid) {
    return new Response(
      JSON.stringify({ success: false, message: 'not authenticated' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, message: 'invalid JSON body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  if (!Array.isArray(body.messages)) {
    return new Response(
      JSON.stringify({ success: false, message: '`messages` must be an array' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  // Force streaming on — the client is built around it. If the caller
  // explicitly wants non-streaming they can hit `/api/newapi/...` instead.
  body.stream = true;

  const upstream = await fetch(`${NEWAPI_INTERNAL_URL}/pg/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${SESSION_COOKIE_NAME}=${session}`,
      'New-Api-User': uid,
    },
    body: JSON.stringify(body),
  });

  // Pipe upstream response straight back. Status is preserved so the
  // client can distinguish 200 streams from 4xx/5xx error envelopes.
  const headers = new Headers();
  // Preserve content-type so the browser keeps the stream open.
  const ct = upstream.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  // SSE-friendly headers — disable buffering on intermediaries.
  headers.set('cache-control', 'no-cache, no-transform');
  headers.set('x-accel-buffering', 'no');

  return new Response(upstream.body, { status: upstream.status, headers });
}
