import { NextResponse } from 'next/server';
import { ensureSameOrigin } from '@/lib/bff';
import { getCurrentUser } from '@/lib/auth';
import {
  synthesizeSpeech,
  ttsConfigured,
  TtsConfigError,
  TtsUpstreamError,
  MAX_INPUT_CHARS,
} from '@/lib/audio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/audio/speech
 *   { input: string, voice?: string, format?: string, instructions?: string }
 *
 * Streams the synthesised audio bytes (audio/mpeg by default) back to
 * the browser. Direct-to-Azure — see lib/audio.ts for the rationale.
 *
 * Auth: requires a valid session cookie. We look up the current user
 * via getCurrentUser to keep the BFF gate honest; without it any
 * unauthenticated browser tab could rack up Azure spend by hitting
 * this endpoint in a loop.
 */
export async function POST(req: Request) {
  const csrf = ensureSameOrigin(req);
  if (csrf) return csrf;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ success: false, message: 'unauthenticated' }, { status: 401 });
  }

  if (!ttsConfigured()) {
    return NextResponse.json(
      { success: false, message: 'TTS not configured on this deployment' },
      { status: 501 },
    );
  }

  let body: { input?: string; voice?: string; format?: string; instructions?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'invalid JSON' }, { status: 400 });
  }
  const input = typeof body.input === 'string' ? body.input : '';
  if (!input.trim()) {
    return NextResponse.json({ success: false, message: 'input required' }, { status: 400 });
  }
  if (input.length > MAX_INPUT_CHARS) {
    return NextResponse.json(
      { success: false, message: `input exceeds ${MAX_INPUT_CHARS} chars` },
      { status: 413 },
    );
  }

  try {
    const { body: stream, contentType } = await synthesizeSpeech({
      input,
      voice: typeof body.voice === 'string' ? body.voice : undefined,
      format: body.format as never,
      instructions:
        typeof body.instructions === 'string' ? body.instructions : undefined,
    });
    return new NextResponse(stream, {
      status: 200,
      headers: {
        'content-type': contentType,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof TtsConfigError) {
      return NextResponse.json({ success: false, message: e.message }, { status: 400 });
    }
    if (e instanceof TtsUpstreamError) {
      return NextResponse.json(
        { success: false, message: e.message, upstream: e.bodyText.slice(0, 500) },
        { status: e.status },
      );
    }
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'tts error' },
      { status: 500 },
    );
  }
}
