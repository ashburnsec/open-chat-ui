import { NextResponse } from 'next/server';
import { ensureSameOrigin, jsonError, NEWAPI_INTERNAL_URL } from '@/lib/bff';
import { rewriteSessionFromUpstream, setUidCookie } from '@/lib/cookie';

export const runtime = 'nodejs';

/**
 * Proxy login → new-api `/api/user/login`, then rewrite the upstream
 * `Set-Cookie: session=...; SameSite=Strict` into a same-origin
 * `SameSite=Lax` cookie that our subsequent BFF requests can attach to.
 */
export async function POST(req: Request) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid JSON body');
  }
  if (!body?.username || !body?.password) {
    return jsonError('username and password required');
  }

  const upstream = await fetch(`${NEWAPI_INTERNAL_URL}/api/user/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  // Always forward the JSON body (success and failure both shaped as envelope).
  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return jsonError('upstream returned non-JSON', 502);
  }

  const res = NextResponse.json(payload, { status: upstream.status });
  rewriteSessionFromUpstream(upstream.headers, res);
  // Capture user id so the BFF passthrough can attach `New-Api-User`.
  const p = payload as { success?: boolean; data?: { id?: number } };
  if (p?.success && typeof p.data?.id === 'number') {
    setUidCookie(res, p.data.id);
  }
  return res;
}
