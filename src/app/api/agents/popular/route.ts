import { NextResponse } from 'next/server';
import { convFetch } from '@/lib/conv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** M43-Prompts-Library · BFF passthrough for /v1/agents/popular (top 20). */
export async function GET() {
  const r = await convFetch('/v1/agents/popular');
  return NextResponse.json(r);
}
