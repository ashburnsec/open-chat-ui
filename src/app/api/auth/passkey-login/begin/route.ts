import { NextResponse } from 'next/server';
import { ensureSameOrigin, jsonError, NEWAPI_INTERNAL_URL } from '@/lib/bff';
import { rewriteSessionFromUpstream } from '@/lib/cookie';

export const runtime = 'nodejs';

/**
 * Step 1 of passkey login. Calls new-api `/api/user/passkey/login/begin`,
 * which stores the WebAuthn challenge in a temporary `session` cookie.
 * We rewrite that cookie same-origin so the browser will attach it to
 * the matching `/finish` call.
 */
export async function POST(req: Request) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;

  const upstream = await fetch(`${NEWAPI_INTERNAL_URL}/api/user/passkey/login/begin`, {
    method: 'POST',
  });

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
