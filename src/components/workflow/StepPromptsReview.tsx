'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Languages, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BilingualPrompt, PromptsLang } from '@/lib/wizard-types';
import { cn } from '@/lib/utils';

/**
 * StepPromptsReview — 审核 + 编辑 4-6 个 prompt.
 *
 * M37: 双语对照模式. 当 promptsBilingual 有值时, 渲染 zh/en 双栏每变体
 * 一行, 用户可编辑任一栏. 顶部有语言切换 chip — 选定的语言版本会送给
 * 上游生图模型 (英文版往往对国外模型如 Gemini 更稳).
 *
 * 单语模式 (promptsBilingual 为空) 退化成原 M36 单列 textarea.
 */
export function StepPromptsReview({
  prompts,
  promptsBilingual,
  onChangePrompts,
  onChangePromptsBilingual,
  onBack,
  onGenerate,
  maxImages,
  busy = false,
}: {
  prompts: string[];
  promptsBilingual?: BilingualPrompt[];
  onChangePrompts: (next: string[]) => void;
  onChangePromptsBilingual?: (next: BilingualPrompt[]) => void;
  onBack: () => void;
  onGenerate: (final: string[]) => void;
  maxImages: number;
  busy?: boolean;
}) {
  const t = useTranslations('workflow.imageGen.step3');
  const isBilingual = !!promptsBilingual && promptsBilingual.length > 0;
  // M37: 选哪个语言版本送给上游 (默认 zh)
  const [activeLang, setActiveLang] = useState<PromptsLang>('zh');

  function updateSingle(idx: number, v: string) {
    const next = [...prompts];
    next[idx] = v;
    onChangePrompts(next);
  }

  function updateBilingual(idx: number, lang: PromptsLang, v: string) {
    if (!promptsBilingual || !onChangePromptsBilingual) return;
    const next = promptsBilingual.map((p, i) =>
      i === idx ? { ...p, [lang]: v } : p,
    );
    onChangePromptsBilingual(next);
  }

  const ready = isBilingual
    ? promptsBilingual!.length === maxImages &&
      promptsBilingual!.every((p) => p[activeLang].trim().length > 0)
    : prompts.length === maxImages && prompts.every((p) => p.trim().length > 0);

  function handleGenerate() {
    if (isBilingual) {
      // 用 active lang 的版本送给上游
      const finalPrompts = promptsBilingual!.map((p) => p[activeLang].trim());
      onGenerate(finalPrompts);
    } else {
      onGenerate(prompts.map((p) => p.trim()));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-8 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        {isBilingual && (
          <div className="inline-flex items-center gap-1 rounded-full border bg-card p-0.5 text-xs">
            <Languages className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
            <button
              type="button"
              onClick={() => setActiveLang('zh')}
              className={cn(
                'rounded-full px-3 py-1 transition-colors',
                activeLang === 'zh'
                  ? 'bg-ink text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('langZh')}
            </button>
            <button
              type="button"
              onClick={() => setActiveLang('en')}
              className={cn(
                'rounded-full px-3 py-1 transition-colors',
                activeLang === 'en'
                  ? 'bg-ink text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t('langEn')}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {Array.from({ length: maxImages }).map((_, idx) => {
          if (isBilingual) {
            const pair = promptsBilingual![idx] ?? { zh: '', en: '' };
            return (
              <div key={idx} className="rounded-lg border bg-card p-3">
                <label className="mb-2 block text-xs font-medium text-muted-foreground">
                  {t('promptLabel', { n: idx + 1 })}
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <BilingualCol
                    label={t('langZh')}
                    value={pair.zh}
                    onChange={(v) => updateBilingual(idx, 'zh', v)}
                    isActive={activeLang === 'zh'}
                  />
                  <BilingualCol
                    label={t('langEn')}
                    value={pair.en}
                    onChange={(v) => updateBilingual(idx, 'en', v)}
                    isActive={activeLang === 'en'}
                  />
                </div>
                <p className="mt-1 text-right text-[10px] text-muted-foreground">
                  {t('activeHint', { lang: activeLang === 'zh' ? t('langZh') : t('langEn') })}
                </p>
              </div>
            );
          }
          const value = prompts[idx] ?? '';
          return (
            <div key={idx} className="rounded-lg border bg-card p-3">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                {t('promptLabel', { n: idx + 1 })}
              </label>
              <textarea
                value={value}
                onChange={(e) => updateSingle(idx, e.target.value)}
                rows={3}
                maxLength={400}
                className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:border-ink focus:outline-none"
              />
              <p className="mt-1 text-right text-[10px] text-muted-foreground">
                {value.length}/400
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={busy}>
          <ArrowLeft className="h-3 w-3" />
          {t('back')}
        </Button>
        <Button onClick={handleGenerate} disabled={!ready || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {t('generate', { n: maxImages })}
        </Button>
      </div>
    </div>
  );
}

function BilingualCol({
  label,
  value,
  onChange,
  isActive,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  isActive: boolean;
}) {
  return (
    <div className="space-y-1">
      <div
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider',
          isActive
            ? 'bg-canvas-soft text-ink'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {label}
        {isActive && <Sparkles className="h-2.5 w-2.5" />}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        maxLength={400}
        className={cn(
          'w-full resize-none rounded-md border bg-background px-3 py-2 text-xs focus:outline-none',
          isActive ? 'border-ink focus:border-ink' : 'border-border focus:border-ink',
        )}
      />
      <p className="text-right text-[9px] text-muted-foreground">{value.length}/400</p>
    </div>
  );
}
