'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowRight, Languages, Loader2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * M42-S4 · storyboard 3 步流程的第 2 步: prompt 审查 + 中英编辑.
 *
 * LLM 在 step='storyboard_prompt' 一次输出 zh+en 两版完整 prompt, 这个
 * 组件让用户在 zh / en 两 tab 各自独立编辑. 检测到用户改了 zh (跟 LLM
 * 初版不同) 显示 "翻译为英文" 按钮 — 点击调 LLM 重新翻译, 覆盖 en tab.
 *
 * 用户点 "生成图片" 时取当前 tab 的 prompt 内容送给生图模型, 进入第 3 步
 * (step='storyboard_image').
 *
 * 跟普通 wizard 的 StepPromptsReview 不同:
 *   - 只有 1 个 prompt (不是 4 个变体)
 *   - 强制中英双语 tab
 *   - 有"翻译"功能 (zh 改了 → 一键覆盖 en)
 */
export function StepStoryboardPromptReview({
  initialZh,
  initialEn,
  imageModel,
  busy,
  onTranslate,
  onGenerate,
}: {
  initialZh: string;
  initialEn: string;
  /** 用来显示预估时长提示 (gpt-image-2 2-3min, 其他模型秒级). */
  imageModel: string;
  busy: boolean;
  /** 用户点"翻译为英文". 服务端调 LLM 翻译, 返回 en 字符串. */
  onTranslate: (zh: string) => Promise<string | null>;
  /** 用户点"生成图片". 父决定送哪个 tab 的 prompt 给生图 step. */
  onGenerate: (prompt: string, lang: 'zh' | 'en') => void | Promise<void>;
}) {
  const t = useTranslations('workflow.storyboard.review');
  const [tab, setTab] = useState<'zh' | 'en'>('zh');
  const [zh, setZh] = useState(initialZh);
  const [en, setEn] = useState(initialEn);
  // 记住 LLM 最初生成的中文版本, 用来检测用户是否改过 (改过 → 显示翻译按钮)
  const [zhBaseline, setZhBaseline] = useState(initialZh);
  const [translating, setTranslating] = useState(false);
  const isGptImage2 = imageModel === 'gpt-image-2';
  const zhDirty = zh.trim() !== zhBaseline.trim();

  async function handleTranslate() {
    if (!zh.trim() || translating) return;
    setTranslating(true);
    try {
      const result = await onTranslate(zh);
      if (result) {
        setEn(result);
        setZhBaseline(zh); // 翻译同步成功后, 当前 zh 成为新基线
      }
    } finally {
      setTranslating(false);
    }
  }

  function handleReset() {
    setZh(initialZh);
    setEn(initialEn);
    setZhBaseline(initialZh);
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-6 sm:px-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{t('title')}</h2>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {/* zh / en tab */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-0.5">
          <button
            type="button"
            onClick={() => setTab('zh')}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              tab === 'zh'
                ? 'bg-ink text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t('tabZh')}
            {zhDirty && tab !== 'zh' && (
              <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-orange-500" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('en')}
            className={cn(
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              tab === 'en'
                ? 'bg-ink text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t('tabEn')}
          </button>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          title={t('resetTooltip')}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t('reset')}
        </button>
      </div>

      {/* textarea (zh / en 各自独立, 切 tab 切显示) */}
      {tab === 'zh' ? (
        <div className="space-y-2">
          <textarea
            value={zh}
            onChange={(e) => setZh(e.target.value)}
            rows={18}
            className="w-full resize-none rounded-md border border-border bg-card px-4 py-3 text-sm leading-relaxed focus:border-ink focus:outline-none"
            placeholder={t('zhPlaceholder')}
          />
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{t('chars', { n: zh.length })}</span>
            {zhDirty && (
              <span className="flex items-center gap-1 text-orange-600">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-orange-500" />
                {t('zhDirtyHint')}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={en}
            onChange={(e) => setEn(e.target.value)}
            rows={18}
            className="w-full resize-none rounded-md border border-border bg-card px-4 py-3 text-sm leading-relaxed focus:border-ink focus:outline-none"
            placeholder={t('enPlaceholder')}
          />
          <p className="text-[11px] text-muted-foreground">
            {t('chars', { n: en.length })}
          </p>
        </div>
      )}

      {/* 翻译按钮 — zh 改过 + 当前在 zh tab 时显示 */}
      {zhDirty && tab === 'zh' && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 dark:border-orange-700 dark:bg-orange-950/30">
          <p className="flex-1 text-xs text-orange-900 dark:text-orange-200">
            {t('translateHint')}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleTranslate()}
            disabled={translating}
            className="gap-1.5"
          >
            {translating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Languages className="h-3.5 w-3.5" />
            )}
            {translating ? t('translating') : t('translateBtn')}
          </Button>
        </div>
      )}

      {/* 模型 + 时长提示 */}
      <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{t('imageModelLabel')}</span>:{' '}
        <span className="font-mono">{imageModel}</span> ·{' '}
        {isGptImage2 ? t('etaGptImage2') : t('etaGeneric')}
      </div>

      {/* 底部生成按钮 */}
      <div className="flex justify-end gap-2">
        <Button
          onClick={() => {
            const prompt = (tab === 'zh' ? zh : en).trim();
            if (!prompt) return;
            void onGenerate(prompt, tab);
          }}
          disabled={busy || !(tab === 'zh' ? zh : en).trim()}
          size="lg"
          className="gap-2"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          {busy ? t('generating') : t('generate', { lang: tab === 'zh' ? t('zhShort') : t('enShort') })}
        </Button>
      </div>
    </div>
  );
}
