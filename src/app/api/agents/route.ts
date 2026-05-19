import { NextResponse } from 'next/server';
import { ensureSameOrigin } from '@/lib/bff';
import { convFetch } from '@/lib/conv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * BFF passthrough for /v1/agents (list + create). Mirrors the pattern
 * used by /api/conversations — convFetch handles the X-NewApi-Cookie /
 * X-NewApi-Uid forwarding and the `{success,message,data}` envelope.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = await convFetch(`/v1/agents${url.search}`);
  return NextResponse.json(r);
}

export async function POST(req: Request) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;
  const body = await req.text();
  const r = await convFetch('/v1/agents', { method: 'POST', body });
  return NextResponse.json(r);
}
