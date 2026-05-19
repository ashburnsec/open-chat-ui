'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Full-screen image viewer. Click backdrop or press Esc to close.
 *
 * `src` is whatever <img> accepts — a `data:` URL for inline base64
 * thumbnails (composer attachments / Gemini image-preview output) or
 * an `/api/files/images/...` URL for stored generated images. Either
 * way we don't double-decode.
 *
 * The download button uses fetch+blob rather than a plain <a download>
 * because cross-origin images would otherwise navigate away instead
 * of saving. Works for both data: URLs and same-origin proxy URLs.
 *
 * Originally inlined inside WorkspacePanel (M12-F); extracted here so
 * MessageList can reuse it for assistant-generated images (M16-E).
 * Download button added so users can save the original-resolution
 * image to disk (covers gemini-*-image-preview inline base64 output
 * + every other image surface in chat-portal).
 */
export function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt?: string;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleDownload(e: React.MouseEvent) {
    e.stopPropagation();
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const ext = blob.type.split('/')[1]?.split(';')[0] || 'png';
      a.download = `chat-image-${ts}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      toast.error('Download failed');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6 backdrop-blur-sm"
    >
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          aria-label="Download image"
          title="下载原图 / Download"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur transition hover:bg-white/25"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt ?? ''}
        className="max-h-[90vh] max-w-[90vw] rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
