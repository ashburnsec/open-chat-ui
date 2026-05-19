import { NextResponse } from 'next/server';
import { ensureSameOrigin } from '@/lib/bff';
import { convStreamFetch } from '@/lib/conv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/conversations/[id]/documents  (multipart, field "file")
 *
 * Forwards a single-file upload to conv-svc, which writes it to disk
 * and returns the extracted text + URL the client uses on the next
 * /messages call. We forward the raw multipart body untouched so the
 * boundary marker stays intact.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;
  const { id } = await ctx.params;
  const ct = req.headers.get('content-type');
  if (!ct?.startsWith('multipart/form-data')) {
    return NextResponse.json(
      { success: false, message: 'expected multipart/form-data' },
      { status: 400 },
    );
  }
  const buf = await req.arrayBuffer();
  const upstream = await convStreamFetch(
    `/v1/conversations/${encodeURIComponent(id)}/documents`,
    {
      method: 'POST',
      headers: { 'Content-Type': ct },
      body: buf,
    },
  );
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
    },
  });
}
