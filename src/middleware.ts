import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME } from './lib/cookie';
import { dispatchMock, isMockEnabled } from './mocks/dispatch';

/**
 * Route protection. Anyone visiting a `(chat)` page (or `/`) without a
 * session cookie is bounced to /auth/sign-in with a `next` param so we
 * land them back where they wanted after login.
 *
 * The session cookie is opaque (encrypted by gin-contrib/sessions) — we
 * can't decrypt it here. Presence is the cheap-but-correct proxy; if the
 * value is forged or expired, the upstream BFF call returns 401 and the
 * Server Component will redirect from inside `getCurrentUser()`.
 */
/**
 * Routes the middleware DOES NOT redirect:
 *  - /auth/*       ← sign-in / sign-up pages and OAuth callback
 *  - /api/*        ← every BFF route — they answer 401 themselves; redirecting
 *                    XHRs to /auth/sign-in produces 307+HTML which is useless
 *                    to a JSON client
 *  - /_next/*, /favicon.ico  ← Next internals & static
 */
// M31-B: `/share/<token>` is public read-only — the token is the
// credential (UUID, not guessable), no session needed.
const PUBLIC_PREFIXES = ['/auth/', '/api/', '/_next/', '/share/'];
// M19: `/` is now the marketing landing page — public for anonymous
// browsing. The page itself does its own auth check and redirects
// logged-in visitors to /welcome (the chat home).
const PUBLIC_EXACT = new Set(['/favicon.ico', '/']);

function isPublic(pathname: string): boolean {
  if (PUBLIC_EXACT.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // ─── Mock mode short-circuits all `/api/*` to local fixtures and
  // skips session-cookie gating so visitors can browse without auth. ───
  if (isMockEnabled()) {
    if (pathname.startsWith('/api/')) {
      const mocked = await dispatchMock(req);
      if (mocked) return mocked;
    }
    return NextResponse.next();
  }

  if (isPublic(pathname)) return NextResponse.next();

  const hasSession = req.cookies.has(SESSION_COOKIE_NAME);
  if (!hasSession) {
    const url = new URL('/auth/sign-in', req.url);
    if (pathname !== '/') {
      url.searchParams.set('next', pathname + search);
    }
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on every request EXCEPT static assets and Next internals.
    // We still let `isPublic` catch /api/auth and /auth above so OAuth
    // callbacks can run unauthenticated.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
