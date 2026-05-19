import { NextResponse } from 'next/server';
import { convFetch } from '@/lib/conv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/conversations/search?q=...&limit=50
 *
 * M31-C: thin passthrough to conv-svc /v1/conversations/search. Read-only,
 * no CSRF gate needed.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const limit = url.searchParams.get('limit') ?? '50';
  if (!q) {
    return NextResponse.json({
      success: true,
      message: '',
      data: { items: [] },
    });
  }
  const params = new URLSearchParams({ q, limit });
  const r = await convFetch(`/v1/conversations/search?${params.toString()}`);
  return NextResponse.json(r);
}
