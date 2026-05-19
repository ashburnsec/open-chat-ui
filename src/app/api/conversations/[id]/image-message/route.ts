import { NextResponse } from 'next/server';
import { ensureSameOrigin } from '@/lib/bff';
import { convFetch } from '@/lib/conv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * M42-S1 · BFF for chat 流的 image-native model (gpt-image-2 等).
 * 同源 + session-bound; conv-svc 端用 user 凭据 mint 内部 Bearer.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;
  const { id } = await ctx.params;
  const body = await req.text();
  const r = await convFetch(`/v1/conversations/${encodeURIComponent(id)}/image-message`, {
    method: 'POST',
    body,
  });
  return NextResponse.json(r);
}
