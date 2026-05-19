import { NextResponse } from 'next/server';
import { ensureSameOrigin, jsonError, NEWAPI_INTERNAL_URL } from '@/lib/bff';
import { rewriteSessionFromUpstream, setUidCookie, SESSION_COOKIE_NAME } from '@/lib/cookie';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';

/**
 * POST /api/auth/login-2fa  { code }
 *
 * Step 2 of 2FA-protected login. The first /api/auth/login call returned
 * `{ require_2fa: true }` and a temporary session cookie holding pending
 * auth state. We forward THAT cookie back along with the user's TOTP /
 * backup code; on success new-api swaps it out for a full session and we
 * rewrite + persist as usual.
 */
export async function POST(req: Request) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid JSON body');
  }
  if (!body.code) return jsonError('code required');

  const store = await cookies();
  const session = store.get(SESSION_COOKIE_NAME)?.value;
  // Forward the pending cookie set by /login. Without it new-api can't
  // associate this code with the in-flight auth attempt.
  const upstream = await fetch(`${NEWAPI_INTERNAL_URL}/api/user/login/2fa`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Cookie: `${SESSION_COOKIE_NAME}=${session}` } : {}),
    },
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
