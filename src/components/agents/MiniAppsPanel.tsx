'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowRight, Boxes, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
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
    <div className="mx-auto w-full max-w-5xl space-y-5 p-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <Boxes className="h-5 w-5 text-ink" />
          <h1 className="text-lg font-semibold tracking-tight text-foreground">{t('title')}</h1>
        </div>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      {agents === null ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('loading')}
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t('empty')}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => void startWizard(a)}
              disabled={busy != null}
              className={cn(
                'group block w-full text-left',
                'disabled:cursor-wait',
              )}
            >
              <Card
                className={cn(
                  'border-border bg-card transition-colors duration-150',
                  'hover:border-ink',
                )}
              >
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-xl">
                    {a.avatar || '🪄'}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-foreground">{a.name}</h3>
                      <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-medium text-ink">
                        {t('badge')}
                      </span>
                    </div>
                    {a.description && (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {a.description}
                      </p>
                    )}
                  </div>
                  {busy === a.id ? (
                    <Loader2 className="mt-1 h-4 w-4 animate-spin text-ink" />
                  ) : (
                    <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-ink" />
                  )}
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
