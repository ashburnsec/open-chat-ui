import { NextResponse } from 'next/server';
import { ensureSameOrigin, jsonError, NEWAPI_INTERNAL_URL } from '@/lib/bff';
import { rewriteSessionFromUpstream, setUidCookie } from '@/lib/cookie';

export const runtime = 'nodejs';

/**
 * Proxy register → new-api `/api/user/register`. Forwards verification_code
 * if the user provided one (only required when email verification is enabled).
 *
 * Some new-api configurations auto-login the user after registration; if so,
 * upstream sets a session cookie which we rewrite. If not, the client should
 * follow up with /api/auth/login.
 */
export async function POST(req: Request) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid JSON body');
  }
  if (!body?.username || !body?.password) {
    return jsonError('username and password required');
  }

  const upstream = await fetch(`${NEWAPI_INTERNAL_URL}/api/user/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return jsonError('upstream returned non-JSON', 502);
  }

  const res = NextResponse.json(payload, { status: upstream.status });
  rewriteSessionFromUpstream(upstream.headers, res);
  const p = payload as { success?: boolean; data?: { id?: number } };
  if (p?.success && typeof p.data?.id === 'number') {
    setUidCookie(res, p.data.id);
  }
  return res;
}
