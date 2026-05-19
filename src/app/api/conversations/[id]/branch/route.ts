import { NextResponse } from 'next/server';
import { ensureSameOrigin } from '@/lib/bff';
import { convFetch } from '@/lib/conv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/conversations/[id]/branch  — body: { headMessageId: number }
 *
 * Sibling-switcher endpoint (M17-P1b). Forwards to conv-svc which
 * advances the conversation's HEAD pointer to the chosen branch's
 * leaf and returns the new currentMessageId.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;
  const { id } = await ctx.params;
  const body = await req.text();
  const r = await convFetch(`/v1/conversations/${encodeURIComponent(id)}/branch`, {
    method: 'POST',
    body,
  });
  return NextResponse.json(r);
}
