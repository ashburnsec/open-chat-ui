'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Square, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * "Read aloud" button for an assistant bubble. Three states:
 *
 *   idle    → speaker icon, click → fetch /api/audio/speech and play
 *   loading → spinner while the upstream synthesises
 *   playing → square (stop) icon, click → pause + back to idle
 *
 * Caching: the synthesised blob is held in a ref so a second click on
 * the same bubble (after stopping) replays without a new Azure round
 * trip. Re-rendering the parent doesn't lose the cached audio because
 * the <audio> element + blob URL are kept on refs, not state.
 *
 * Cleanup: the cached blob URL is revoked + audio paused when the
 * component unmounts (sidebar conv switch / page unload). Without
 * this we'd leak both bytes and an active <audio> instance.
 *
 * Disabled when text is empty or shorter than 2 chars to avoid
 * accidental fee-incurring clicks on placeholder bubbles.
 */
export function SpeakButton({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const t = useTranslations('chat.audio');
  const [state, setState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      audioRef.current = null;
      blobUrlRef.current = null;
    };
  }, []);

  // Re-fetching is required when the text actually changes (e.g.
  // assistant message edited / regenerated and the SpeakButton stays
  // mounted) — drop the cache so the next click re-synthesises.
  useEffect(() => {
    audioRef.current?.pause();
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    audioRef.current = null;
    blobUrlRef.current = null;
    setState('idle');
  }, [text]);

  async function ensureAudio(): Promise<HTMLAudioElement | null> {
    if (audioRef.current) return audioRef.current;
    try {
      const res = await fetch('/api/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: text }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const msg =
          (j as { message?: string })?.message ?? `HTTP ${res.status}`;
        toast.error(t('failed', { reason: msg }));
        return null;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      const audio = new Audio(url);
      audio.onended = () => setState('idle');
      audio.onerror = () => {
        setState('idle');
        toast.error(t('playFailed'));
      };
      audioRef.current = audio;
      return audio;
    } catch (e) {
      toast.error(t('failed', { reason: e instanceof Error ? e.message : 'network' }));
      return null;
    }
  }

  async function toggle() {
    if (state === 'loading') return;
    if (state === 'playing') {
      audioRef.current?.pause();
      setState('idle');
      return;
    }
    setState('loading');
    const audio = await ensureAudio();
    if (!audio) {
      setState('idle');
      return;
    }
    try {
      audio.currentTime = 0;
      await audio.play();
      setState('playing');
    } catch (e) {
      setState('idle');
      toast.error(t('playFailed'));
    }
  }

  const disabled = state === 'loading' || !text || text.trim().length < 2;
  const label =
    state === 'playing' ? t('stop') : state === 'loading' ? t('loading') : t('speak');

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded transition-colors',
        'hover:bg-accent hover:text-foreground',
        disabled && 'pointer-events-none opacity-50',
        className,
      )}
    >
      {state === 'loading' ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : state === 'playing' ? (
        <Square className="h-3.5 w-3.5 fill-current" />
      ) : (
        <Volume2 className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
