import { NextResponse } from 'next/server';
import { ensureSameOrigin } from '@/lib/bff';
import { convFetch } from '@/lib/conv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** M43-Prompts-Library · POST /v1/agents/:slug/use — usage telemetry. */
export async function POST(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;
  const { slug } = await ctx.params;
  const r = await convFetch(`/v1/agents/${encodeURIComponent(slug)}/use`, {
    method: 'POST',
  });
  return NextResponse.json(r);
}
