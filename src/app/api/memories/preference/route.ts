import { NextResponse } from 'next/server';
import { ensureSameOrigin } from '@/lib/bff';
import { convFetch } from '@/lib/conv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * PUT /api/memories/preference  { memory_enabled: boolean }
 *
 * Note: this route is intentionally a STATIC sibling of /api/memories/[id]/
 * — Next.js resolves static routes before dynamic ones, so /preference
 * never falls through to the [id] handler.
 */
export async function PUT(req: Request) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;
  const body = await req.text();
  const r = await convFetch('/v1/memories/preference', { method: 'PUT', body });
  return NextResponse.json(r);
}
