'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowRight, Boxes, Loader2,
  ImagePlus, Clapperboard, ShoppingBag, Layout,
  Wand2, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Agent } from '@/components/agents/AgentsPanel';
import { cn } from '@/lib/utils';

/**
 * M37 · /mini-apps 智能体目录 panel.
 *
 * 拉 /api/agents → filter flow_type='workflow' → 大卡片 grid.
 * 点击卡片创建 wizard conversation 跳 /c/[id], 由 c/[id]/page.tsx
 * 检测 wizard_metadata.kind 分流到 WizardCanvas (M36 已建).
 *
 * 一键生图 (kind='image-gen') 是当前唯一一个. 后续电商/海报/漫剧:
 * admin 新增 agent row + 设 flow_type='workflow' + flow_config 携带
 * 默认 wizard_metadata 即可, 不需要前端加代码.
 */
export function MiniAppsPanel() {
  const t = useTranslations('miniApps');
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch('/api/agents', { cache: 'no-store' });
        const j = await r.json();
        const list: Agent[] = Array.isArray(j)
          ? j
          : Array.isArray(j?.data)
            ? j.data
            : Array.isArray(j?.data?.items)
              ? j.data.items
              : [];
        if (!cancelled) setAgents(list.filter((a) => a.flow_type === 'workflow'));
      } catch {
        if (!cancelled) setAgents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function startWizard(agent: Agent) {
    if (busy != null) return;
    setBusy(agent.id);
    try {
      // M42-S2: 从 agent.flow_config 读 wizard_kind / image_model / aspect /
      // tier / quality / use_case 注入 wizard_metadata. 没设的字段才走硬
      // 编码 fallback. 这样不同 mini-app (一键生图 vs 分镜) 进 wizard
      // 第一秒就是各自的默认值, 不需要用户去 Step 1 改.
      const config =
        (agent.flow_config as Record<string, unknown> | null | undefined) ?? {};
      const kind = (config.wizard_kind as string) || 'image-gen';
      const imageModel = (config.image_model as string) || 'gpt-image-2';
      const aspectRatio = (config.aspect_ratio as string) || '1:1';
      const imageTier = (config.image_tier as string) || '1K';
      const imageQuality = config.image_quality as string | undefined;
      const useCase = config.use_case as string | undefined;
      const r = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-5.5',
          title: `${agent.avatar || '🪄'} ${agent.name} (草稿)`,
          wizard_metadata: {
            kind,
            planner_model: 'gpt-5.5',
            image_model: imageModel,
            aspect_ratio: aspectRatio,
            image_tier: imageTier,
            ...(imageQuality ? { image_quality: imageQuality } : {}),
            ...(useCase ? { use_case: useCase } : {}),
          },
        }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success || !j.data?.id) {
        throw new Error(j?.message || t('createFailed'));
      }
      router.push(`/c/${j.data.id}` as never);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('createFailed'));
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-6">
      {/* Header */}
      <header className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-lg font-semibold tracking-tight">{t('title')}</h1>
        </div>
        <p className="text-[13px] text-muted-foreground">{t('subtitle')}</p>
      </header>

      {agents === null ? (
        /* Skeleton */
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-4 rounded-xl border border-border p-5">
              <div className="flex items-start justify-between">
                <div className="h-12 w-12 animate-pulse rounded-xl bg-muted" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-muted" />
              </div>
              <div className="space-y-2">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="h-3 w-full animate-pulse rounded bg-muted/60" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted/60" />
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="h-5 w-12 animate-pulse rounded-full bg-muted/60" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
          <Sparkles className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-[13px] text-muted-foreground">{t('empty')}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => (
            <MiniAppCard
              key={a.id}
              agent={a}
              busy={busy === a.id}
              disabled={busy != null && busy !== a.id}
              onStart={() => void startWizard(a)}
              badge={t('badge')}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Icon + colour mapping ────────────────────────────────────────────

type IconSpec = {
  Icon: React.ComponentType<{ className?: string }>;
  bg: string;
  fg: string;
  steps: string[];
};

const SLUG_SPEC: Record<string, IconSpec> = {
  'wf-one-click-image': {
    Icon: ImagePlus,
    bg: 'bg-violet-100 dark:bg-violet-950',
    fg: 'text-violet-600 dark:text-violet-400',
    steps: ['输入描述', 'AI 出方向', '生成图片', '精修完成'],
  },
  'wf-storyboard': {
    Icon: Clapperboard,
    bg: 'bg-amber-100 dark:bg-amber-950',
    fg: 'text-amber-600 dark:text-amber-400',
    steps: ['描述场景', 'AI 分镜', '生成画面', '导出'],
  },
  'wf-ecommerce': {
    Icon: ShoppingBag,
    bg: 'bg-emerald-100 dark:bg-emerald-950',
    fg: 'text-emerald-600 dark:text-emerald-400',
    steps: ['上传商品图', 'AI 规划', '生成方案', '导出'],
  },
  'wf-poster': {
    Icon: Layout,
    bg: 'bg-sky-100 dark:bg-sky-950',
    fg: 'text-sky-600 dark:text-sky-400',
    steps: ['填写信息', 'AI 排版', '生成海报', '下载'],
  },
};

const FALLBACK_SPEC: IconSpec = {
  Icon: Wand2,
  bg: 'bg-muted',
  fg: 'text-muted-foreground',
  steps: ['开始', '处理', '生成', '完成'],
};

function resolveSpec(agent: Agent): IconSpec {
  return SLUG_SPEC[agent.slug] ?? FALLBACK_SPEC;
}

// ── MiniAppCard ──────────────────────────────────────────────────────

function MiniAppCard({
  agent,
  busy,
  disabled,
  onStart,
  badge,
}: {
  agent: Agent;
  busy: boolean;
  disabled: boolean;
  onStart: () => void;
  badge: string;
}) {
  const { Icon, bg, fg, steps } = resolveSpec(agent);

  return (
    <button
      type="button"
      onClick={onStart}
      disabled={disabled || busy}
      className={cn(
        'group flex flex-col items-start gap-4 rounded-xl border border-border bg-background p-5 text-left',
        'transition-all duration-150 hover:-translate-y-0.5 hover:border-foreground/25 hover:shadow-[var(--shadow-4)]',
        (disabled || busy) && 'cursor-wait opacity-60',
      )}
    >
      {/* Top row: icon + badge */}
      <div className="flex w-full items-start justify-between">
        <div className={cn('flex h-12 w-12 items-center justify-center rounded-xl', bg)}>
          {busy
            ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            : <Icon className={cn('h-6 w-6', fg)} strokeWidth={1.75} />
          }
        </div>
        <span className="rounded-full border border-border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {badge}
        </span>
      </div>

      {/* Name + description */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <h3 className="text-[15px] font-semibold leading-tight tracking-tight text-foreground">
          {agent.name}
        </h3>
        {agent.description && (
          <p className="line-clamp-2 text-[12px] leading-relaxed text-muted-foreground">
            {agent.description}
          </p>
        )}
      </div>

      {/* Step pipeline */}
      <div className="flex w-full items-center gap-0">
        {steps.map((step, idx) => (
          <div key={step} className="flex min-w-0 flex-1 items-center">
            <span className="truncate rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-muted-foreground">
              {step}
            </span>
            {idx < steps.length - 1 && (
              <ArrowRight className="mx-0.5 h-3 w-3 shrink-0 text-border" strokeWidth={2} />
            )}
          </div>
        ))}
      </div>

      {/* CTA hint */}
      <div className="flex w-full items-center justify-end">
        <span className="flex items-center gap-1 text-[12px] font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          立即使用
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
        </span>
      </div>
    </button>
  );
}
