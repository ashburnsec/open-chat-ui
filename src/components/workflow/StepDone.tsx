'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Download, Film, Loader2, Pencil, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Lightbox } from '@/components/ui/Lightbox';

/**
 * M36 wizard step 6 — 最终稿. 大图展示 + 下载. 进度条最后一格.
 * 历史所有迭代的回顾在 WizardHistory 里, 这里只突出最终稿.
 */
export function StepDone({
  finalUrl,
  finalIteration,
  onContinueToVideo,
  videoBusy = false,
}: {
  finalUrl: string;
  finalIteration: number | null;
  /** M42-S5 PR-A: 仅 storyboard mini-app 传, 父调 step='video_plan' 进续步.
   *  其他 mini-app 不传, 按钮不显. */
  onContinueToVideo?: () => void | Promise<void>;
  videoBusy?: boolean;
}) {
  const t = useTranslations('workflow.imageGen.done');
  const tEditor = useTranslations('editor');
  const tVideo = useTranslations('workflow.storyboard.videoPlan');
  const [lightboxOpen, setLightboxOpen] = useState(false);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex items-center gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-[var(--shadow-button)]">
          <Trophy className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-xl font-semibold tracking-tight">{t('title')}</h2>
          <p className="text-sm text-muted-foreground">
            {finalIteration
              ? t('subtitleIter', { n: finalIteration })
              : t('subtitleFirst')}
          </p>
        </div>
      </header>

      <figure className="overflow-hidden rounded-md border border-border bg-card shadow-[var(--shadow-soft)]">
        <button type="button" onClick={() => setLightboxOpen(true)} className="block w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={finalUrl}
            alt="final"
            className="aspect-square w-full object-cover transition-transform hover:scale-[1.02]"
          />
        </button>
      </figure>

      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild size="lg">
          <a href={finalUrl} download={`final-${Date.now()}.png`}>
            <Download className="h-4 w-4" />
            {t('download')}
          </a>
        </Button>
        {/* M37: 进 P 图编辑器 */}
        <Button asChild size="lg" variant="outline">
          <Link href={`/editor?image=${encodeURIComponent(finalUrl)}` as never}>
            <Pencil className="h-4 w-4" />
            {tEditor('openEditor')}
          </Link>
        </Button>
        {/* M42-S5 PR-A: storyboard mini-app 续步入口 */}
        {onContinueToVideo && (
          <Button
            onClick={() => void onContinueToVideo()}
            disabled={videoBusy}
            size="lg"
            variant="default"
            className="gap-2"
          >
            {videoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
            {videoBusy ? tVideo('starting') : tVideo('continueToVideoBtn')}
          </Button>
        )}
      </div>

      {lightboxOpen && <Lightbox src={finalUrl} onClose={() => setLightboxOpen(false)} />}
    </div>
  );
}
