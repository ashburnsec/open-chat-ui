import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { APP_ORIGIN, NEWAPI_INTERNAL_URL, safeNextPath } from '@/lib/bff';
import { rewriteSessionFromUpstream, SESSION_COOKIE_NAME } from '@/lib/cookie';

export const runtime = 'nodejs';

/**
 * GET /auth/oauth/:provider/callback?code=&state=
 *
 * The OAuth provider (GitHub / Google / Discord / OIDC / custom) redirects
 * the user here after consent. We:
 *   1) forward `code` & `state` to new-api `/api/oauth/:provider`,
 *      attaching any anonymous session cookie our /api/auth/oauth-state
 *      handler put on this origin,
 *   2) capture upstream's authenticated `Set-Cookie: session=...`,
 *   3) rewrite to same-origin SameSite=Lax,
 *   4) redirect to `/` (or to the `next` query param if safe).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const next = url.searchParams.get('next');
  const oauthError = url.searchParams.get('error');

  // Pre-flight: provider returned an error (user cancelled, scope denied, …)
  if (oauthError) {
    return NextResponse.redirect(
      new URL(`/auth/sign-in?oauth_error=${encodeURIComponent(oauthError)}`, APP_ORIGIN),
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(new URL('/auth/sign-in?oauth_error=missing_params', APP_ORIGIN));
  }

  // Forward the anonymous session (set during /api/auth/oauth-state) so
  // upstream can validate that this `state` belongs to the same browser.
  const store = await cookies();
  const session = store.get(SESSION_COOKIE_NAME)?.value;

  const upstreamUrl = `${NEWAPI_INTERNAL_URL}/api/oauth/${encodeURIComponent(
    provider,
  )}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
  const upstream = await fetch(upstreamUrl, {
    headers: session ? { Cookie: `${SESSION_COOKIE_NAME}=${session}` } : {},
  });

  let payload: { success?: boolean; message?: string } = {};
  try {
    payload = await upstream.json();
  } catch {
    /* not all providers return JSON on success — sometimes a redirect */
  }

  if (!upstream.ok || payload.success === false) {
    const msg = payload.message ?? `oauth ${provider} failed`;
    return NextResponse.redirect(
      new URL(`/auth/sign-in?oauth_error=${encodeURIComponent(msg)}`, APP_ORIGIN),
    );
  }

  // Whitelist `next` — only allow path-form, never absolute URLs.
  const safeNext = safeNextPath(next);
  const res = NextResponse.redirect(new URL(safeNext, APP_ORIGIN));
  rewriteSessionFromUpstream(upstream.headers, res);
  return res;
}
