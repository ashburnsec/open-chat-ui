import { NextResponse } from 'next/server';
import { jsonError, NEWAPI_INTERNAL_URL } from '@/lib/bff';

export const runtime = 'nodejs';

/**
 * GET /api/auth/verification?email=&type=register|reset|binding
 * Triggers new-api to email a 6-digit verification code.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = url.searchParams.get('email');
  const type = url.searchParams.get('type');
  if (!email || !type) return jsonError('email and type required');
  if (!['register', 'reset', 'binding'].includes(type)) {
    return jsonError('invalid type');
  }

  const upstreamUrl = `${NEWAPI_INTERNAL_URL}/api/verification?email=${encodeURIComponent(
    email,
  )}&type=${type}`;
  const upstream = await fetch(upstreamUrl);
  let payload: unknown;
  try {
    payload = await upstream.json();
  } catch {
    return jsonError('upstream returned non-JSON', 502);
  }
  return NextResponse.json(payload, { status: upstream.status });
}
