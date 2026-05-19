import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ensureSameOrigin, NEWAPI_INTERNAL_URL } from '@/lib/bff';
import { rewriteSessionFromUpstream, SESSION_COOKIE_NAME, UID_COOKIE_NAME } from '@/lib/cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * new-api collection endpoints whose Gin Group("/") registration triggers
 * a 307 redirect when called without a trailing slash. We can't rely on
 * fetch following the redirect because POST + 307 across our buffered
 * body machinery is unreliable. Instead, append "/" before forwarding.
 *
 * Add new entries here when you onboard a collection-shape upstream path.
 */
const COLLECTION_PATHS = [
  'api/token',
  'api/channel',
  'api/user',
  'api/redemption',
  'api/log',
  'api/option',
  'api/subscription',
];

/**
 * Generic same-origin BFF passthrough to new-api.
 *
 *   Browser → /api/newapi/api/user/self
 *   BFF     → http://newapi:3000/api/user/self     (Cookie attached)
 *
 * Never use this for streaming endpoints (e.g. /pg/chat/completions); those
 * have a dedicated handler that pipes SSE chunks. This one buffers the
 * whole upstream response.
 */
async function proxy(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  // Mock mode: short-circuit to local fixtures without touching the network.
  if (process.env.NEXT_PUBLIC_USE_MOCK === 'true') {
    const { path: pathSegments } = await ctx.params;
    const upstreamPath = '/' + pathSegments.join('/');
    const { mockNewapi } = await import('@/mocks/server');
    const data = await mockNewapi(upstreamPath);
    return NextResponse.json(data);
  }

  // CSRF gate for unsafe methods. GET/HEAD pass through.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const csrf = ensureSameOrigin(req);
    if (csrf) return csrf;
  }

  const { path } = await ctx.params;
  const store = await cookies();
  const session = store.get(SESSION_COOKIE_NAME)?.value;
  const uid = store.get(UID_COOKIE_NAME)?.value;

  const url = new URL(req.url);
  // new-api Gin routes registered as Group("/") expect a trailing slash on
  // the collection root (e.g. POST /api/token/) and emit 307 otherwise,
  // which fetch refuses to follow with a body. Next.js, meanwhile, strips
  // trailing slashes from incoming URLs before our handler runs. So we
  // canonicalise by ALWAYS appending a trailing slash for any collection-
  // shape path (no extension, no further segments). Per-resource paths
  // like /api/token/123 stay slash-free.
  const joined = path.join('/');
  const isCollectionRoot = COLLECTION_PATHS.some((p) => joined === p);
  const upstreamPath = isCollectionRoot ? `${joined}/` : joined;
  const upstreamUrl = `${NEWAPI_INTERNAL_URL}/${upstreamPath}${url.search}`;

  // Forward only headers the upstream cares about. Crucially:
  //  - Replace `cookie` with the session-only one we minted.
  //  - Strip `host`, `origin`, `connection`, etc. (per-hop or wrong-target).
  const fwd = new Headers();
  for (const [k, v] of req.headers) {
    const lower = k.toLowerCase();
    if (
      lower === 'cookie' ||
      lower === 'host' ||
      lower === 'origin' ||
      lower === 'connection' ||
      lower === 'content-length' ||
      lower.startsWith('x-vercel-')
    ) continue;
    fwd.set(k, v);
  }
  if (session) fwd.set('cookie', `${SESSION_COOKIE_NAME}=${session}`);
  // new-api requires this header to match the session-bound user id; see
  // `new-api/middleware/auth.go:96-122`. Without it every authed call 401s.
  if (uid) fwd.set('new-api-user', uid);

  const init: RequestInit = { method: req.method, headers: fwd };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // Buffer the entire body. Streaming via `init.body = req.body` +
    // `duplex: 'half'` is unreliable on Next 15 dev (undici complains
    // "expected non-null body source"). For chat-portal's traffic shape
    // (≤ a few MB per request, mostly multipart image uploads) buffering
    // is fine; we'll revisit if we ship file-uploads of arbitrary size.
    const buf = await req.arrayBuffer();
    if (buf.byteLength > 0) init.body = buf;
  }

  const upstream = await fetch(upstreamUrl, init);

  // Build the outgoing response, piping the upstream body without
  // buffering. Next supports passing a ReadableStream as the body.
  const res = new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
  });

  // Forward safe response headers; drop hop-by-hop & set-cookie (handled below).
  for (const [k, v] of upstream.headers) {
    const lower = k.toLowerCase();
    if (
      lower === 'content-encoding' ||
      lower === 'content-length' ||
      lower === 'transfer-encoding' ||
      lower === 'connection' ||
      lower === 'set-cookie'
    ) continue;
    res.headers.set(k, v);
  }

  // Propagate session rotation if upstream issued a new cookie.
  rewriteSessionFromUpstream(upstream.headers, res);
  return res;
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
