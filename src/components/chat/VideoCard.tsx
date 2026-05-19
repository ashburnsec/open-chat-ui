'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useVideoTask } from '@/hooks/use-video-task';
import type { VideoTask } from '@/hooks/use-chat-stream';

/**
 * M27: Veo task bubble. Three visual states keyed off `task.status`:
 *
 *   queued / in_progress → progress bar + duration hint + spinner
 *   completed            → <video controls> + download button
 *   failed               → error icon + message + retry hint
 *
 * Polling lives here (via useVideoTask) so the card is the single
 * source of truth for transient UI state. The hook calls back with the
 * next VideoTask snapshot; we forward it to MessageList via onChange so
 * the persisted message in `messages[]` stays in sync — needed for
 * subsequent re-renders (e.g. the user pins / unpins the conv) to keep
 * showing the right state without re-polling.
 *
 * The video URL is `/api/files/videos/{taskId}` — proxied through
 * conv-svc with the user's Bearer token attached internally. Never a
 * direct new-api URL, so the cookie / uid auth gate stays intact.
 */
export function VideoCard({
  task,
  onChange,
}: {
  task: VideoTask;
  onChange: (next: VideoTask) => void;
}) {
  const t = useTranslations('chat.video');
  const [downloading, setDownloading] = useState(false);

  useVideoTask({ task, onUpdate: onChange });

  if (task.status === 'failed') {
    return (
      <div className="my-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="flex flex-col gap-1">
          <p className="font-medium text-destructive">{t('failed')}</p>
          {task.errorMessage && (
            <p className="text-xs text-muted-foreground">{task.errorMessage}</p>
          )}
          <p className="text-xs text-muted-foreground">{t('retryHint')}</p>
        </div>
      </div>
    );
  }

  if (task.status !== 'completed' || !task.videoUrl) {
    const progress = Math.max(0, Math.min(100, task.progress ?? 0));
    return (
      <div className="my-2 flex flex-col gap-2 rounded-md border bg-muted/30 p-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{t('generating')}</span>
          <span className="ml-auto font-mono text-xs">{progress}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">{t('etaHint')}</p>
      </div>
    );
  }

  async function handleDownload() {
    if (downloading || !task.videoUrl) return;
    setDownloading(true);
    try {
      const res = await fetch(task.videoUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `chat-video-${ts}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      toast.error(t('downloadFailed'));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="my-2 flex flex-col gap-2">
      <div className="group relative overflow-hidden rounded-md bg-black">
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          src={task.videoUrl}
          controls
          playsInline
          preload="metadata"
          className="block max-h-[480px] w-full"
        />
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          aria-label={t('download')}
          title={t('download')}
          className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white opacity-100 backdrop-blur transition hover:bg-black/60 disabled:opacity-40 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <Download className="h-4 w-4" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">{t('savedHint')}</p>
    </div>
  );
}
