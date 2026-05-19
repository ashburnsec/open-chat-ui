/**
 * Server-only Azure OpenAI TTS client.
 *
 * Why direct, not through new-api: as of new-api v1.0.0-rc.2 the openai
 * audio handler discards the upstream MP3 body and returns
 * `Content-Type: application/json` with 0 bytes. Going around it keeps
 * us unblocked. The cost is that TTS calls don't show up in new-api's
 * usage log — we accept that for V1 (audio volume is small, and the
 * commercialisation path isn't live yet). When new-api gains a working
 * handler we can flip this to channel-routed.
 *
 * Security: the Azure key is server-only — there's no `NEXT_PUBLIC_`
 * prefix, so it never lands in the client bundle. The browser hits
 * `/api/audio/speech` → this module → Azure, with the user's session
 * cookie validated at the BFF entry.
 */

const AZURE_TTS_ENDPOINT = process.env.AZURE_TTS_ENDPOINT?.replace(/\/+$/, '');
const AZURE_TTS_DEPLOYMENT = process.env.AZURE_TTS_DEPLOYMENT || 'gpt-4o-mini-tts';
const AZURE_TTS_API_VERSION = process.env.AZURE_TTS_API_VERSION || '2025-03-01-preview';
const AZURE_TTS_KEY = process.env.AZURE_TTS_KEY;

export type TtsRequest = {
  /** The text to read aloud. Capped at MAX_INPUT_CHARS server-side. */
  input: string;
  /** OpenAI voice preset; gpt-4o-mini-tts ships alloy / ash / coral /
   *  echo / fable / onyx / nova / sage / shimmer. */
  voice?: string;
  /** mp3 (default), opus, aac, flac, wav, pcm. */
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
  /** Per-request style hint understood by gpt-4o-mini-tts (e.g. "Speak
   *  in a cheerful and positive tone"). Ignored by older TTS models. */
  instructions?: string;
};

/** Cap input length so a runaway client can't burn the wallet on a
 *  single call. ~3000 chars ≈ 2 minutes of speech, plenty for any
 *  bubble-level "read aloud" use case. */
export const MAX_INPUT_CHARS = 4000;

export class TtsConfigError extends Error {}
export class TtsUpstreamError extends Error {
  constructor(
    public status: number,
    message: string,
    public bodyText: string,
  ) {
    super(message);
  }
}

export function ttsConfigured(): boolean {
  return !!AZURE_TTS_ENDPOINT && !!AZURE_TTS_KEY;
}

export async function synthesizeSpeech(req: TtsRequest): Promise<{
  body: ReadableStream<Uint8Array>;
  contentType: string;
}> {
  if (!AZURE_TTS_ENDPOINT || !AZURE_TTS_KEY) {
    throw new TtsConfigError('AZURE_TTS_ENDPOINT or AZURE_TTS_KEY missing');
  }
  const input = req.input.slice(0, MAX_INPUT_CHARS).trim();
  if (!input) throw new TtsConfigError('input is empty');

  const url = `${AZURE_TTS_ENDPOINT}/openai/deployments/${encodeURIComponent(
    AZURE_TTS_DEPLOYMENT,
  )}/audio/speech?api-version=${encodeURIComponent(AZURE_TTS_API_VERSION)}`;

  const body: Record<string, unknown> = {
    model: AZURE_TTS_DEPLOYMENT,
    input,
    voice: req.voice || 'alloy',
  };
  if (req.format) body.response_format = req.format;
  if (req.instructions) body.instructions = req.instructions;

  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // Azure accepts both `api-key` and `Authorization: Bearer …`;
      // api-key is the historical preferred form for resource keys.
      'api-key': AZURE_TTS_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => '');
    throw new TtsUpstreamError(
      upstream.status,
      `Azure TTS ${upstream.status}`,
      text,
    );
  }
  return {
    body: upstream.body,
    contentType: upstream.headers.get('content-type') ?? 'audio/mpeg',
  };
}
