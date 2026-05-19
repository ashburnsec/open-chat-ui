import { NextResponse } from 'next/server';
import { jsonError, NEWAPI_INTERNAL_URL } from '@/lib/bff';
import { rewriteSessionFromUpstream } from '@/lib/cookie';

export const runtime = 'nodejs';

/**
 * GET /api/auth/oauth-state?aff=...
 * Returns the CSRF state token the client passes to the OAuth provider.
 *
 * new-api stores affiliate code + state in its session, so it Set-Cookie's a
 * temporary anonymous session here that we must propagate to our origin —
 * otherwise the OAuth callback will fail state validation upstream.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const aff = url.searchParams.get('aff');
  const upstreamUrl = `${NEWAPI_INTERNAL_URL}/api/oauth/state${aff ? `?aff=${encodeURIComponent(aff)}` : ''}`;

  const upstream = await fetch(upstreamUrl);
  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return jsonError('upstream returned non-JSON', 502);
  }
  const res = NextResponse.json(payload, { status: upstream.status });
  rewriteSessionFromUpstream(upstream.headers, res);
  return res;
}
