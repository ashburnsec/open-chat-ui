'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Pencil, RefreshCw, Unlink, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/hooks/use-confirm';
import { cn } from '@/lib/utils';
import type { Agent } from '@/components/agents/PromptsLibrary';

/**
 * M43-Prompts-Library · AgentInfoModal
 *
 * Opens from ChatPanel 顶部 agent pill. Shows full agent info + 3 actions:
 *   - 切换角色 → 弹角色选择器 grid (用同 PromptsLibrary 简化版)
 *   - 解除绑定 → 二次确认 → PATCH conv agent_id=null → reload
 *   - 编辑此角色 (仅 user 私有) → 跳 /agents/{slug}/edit
 *
 * 切换/解绑不影响已有 messages — system_prompt 在 conv 创建时已 snapshot 到
 * conversations.system_prompt (M13 设计意图).
 */

export type AgentDetail = {
  id: number;
  slug: string;
  name: string;
  avatar: string;
  description?: string | null;
  system_prompt?: string;
  tags?: string[];
  source?: 'system' | 'curated' | 'user';
  name_en?: string | null;
  description_en?: string | null;
  system_prompt_en?: string | null;
  is_system?: boolean;
  editable?: boolean;
};

export function AgentInfoModal({
  open,
  onOpenChange,
  conversationId,
  agent,
  onChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  conversationId: string;
  agent: AgentDetail;
  /** Called after switch/unbind succeeds so parent can refresh ChatPanel agent state. */
  onChange: () => void;
}) {
  const tModal = useTranslations('agentModal');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const confirm = useConfirm();
  const [detail, setDetail] = useState<AgentDetail>(agent);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerAgents, setPickerAgents] = useState<AgentDetail[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState<'zh' | 'en'>('zh');

  // 拉完整 agent 详情 (system_prompt 全文 / tags / _en 字段 — pill 上的
  // ChatPanelAgent 只有 4 字段)
  useEffect(() => {
    if (!open) return;
    setDetail(agent);
    void (async () => {
      try {
        const r = await fetch(`/api/agents/${encodeURIComponent(agent.slug)}`, {
          cache: 'no-store',
        });
        const j = await r.json();
        if (j?.success && j.data) setDetail(j.data as AgentDetail);
      } catch {
        /* keep pill-level detail */
      }
    })();
  }, [open, agent]);

  async function loadPicker() {
    if (pickerAgents !== null) return;
    try {
      const r = await fetch('/api/agents', { cache: 'no-store' });
      const j = await r.json();
      if (j?.success && Array.isArray(j.data?.items)) {
        const arr = (j.data.items as AgentDetail[]).filter(
          (a) => (a as Agent).flow_type !== 'workflow' && a.id !== detail.id,
        );
        setPickerAgents(arr);
      }
    } catch {
      setPickerAgents([]);
    }
  }

  async function patchConv(agentId: number | null): Promise<boolean> {
    setBusy(true);
    try {
      const r = await fetch(`/api/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: agentId }),
      });
      const j = await r.json();
      if (!r.ok || !j?.success) throw new Error(j?.message || tCommon('error'));
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tCommon('error'));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleSwitch(next: AgentDetail) {
    const ok = await patchConv(next.id);
    if (!ok) return;
    onOpenChange(false);
    onChange();
    toast.success(tModal('switched', { name: next.name }));
    router.refresh();
  }

  async function handleUnbind() {
    const ok = await confirm({
      title: tModal('unbindAgent'),
      description: tModal('unbindConfirm'),
      confirmLabel: tModal('unbindAgent'),
      cancelLabel: tCommon('cancel'),
      variant: 'destructive',
    });
    if (!ok) return;
    const succ = await patchConv(null);
    if (!succ) return;
    onOpenChange(false);
    onChange();
    toast.success(tModal('unbound'));
    router.refresh();
  }

  const sourceLabel =
    detail.source === 'curated'
      ? tModal('sourceCurated')
      : detail.source === 'user'
        ? tModal('sourceUser')
        : tModal('sourceSystem');

  const hasEnglish =
    lang === 'en' && (detail.name_en || detail.description_en || detail.system_prompt_en);
  const displayName = hasEnglish ? (detail.name_en ?? detail.name) : detail.name;
  const displayDesc = hasEnglish
    ? (detail.description_en ?? detail.description ?? '')
    : (detail.description ?? '');
  const displayPrompt = hasEnglish
    ? (detail.system_prompt_en ?? detail.system_prompt ?? '')
    : (detail.system_prompt ?? '');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="sr-only">{detail.name}</DialogTitle>
        </DialogHeader>

        {showPicker ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{tModal('switchAgent')}</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowPicker(false)}>
                {tCommon('cancel')}
              </Button>
            </div>
            {pickerAgents === null ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid max-h-96 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
                {pickerAgents.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => void handleSwitch(a)}
                    disabled={busy}
                    className="flex flex-col items-center gap-1 rounded-md border border-border bg-card p-3 text-center transition-all hover:-translate-y-0.5 hover:border-ink hover:shadow-md"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-2xl">
                      {a.avatar}
                    </div>
                    <span className="line-clamp-1 max-w-full text-xs">{a.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* 顶部: 大圆 avatar + 名字 + tag + source badge */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-5xl shadow-inner">
                {detail.avatar}
              </div>
              <h2 className="text-lg font-semibold">{displayName}</h2>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium',
                    detail.source === 'curated'
                      ? 'bg-canvas-soft text-ink'
                      : detail.source === 'user'
                        ? 'bg-accent text-foreground'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {sourceLabel}
                </span>
                {(detail.tags ?? []).map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                  >
                    #{t}
                  </span>
                ))}
              </div>
              {displayDesc && (
                <p className="text-center text-xs text-muted-foreground">{displayDesc}</p>
              )}
            </div>

            {/* 中英切换 (仅当有 _en 时显示) */}
            {(detail.name_en || detail.description_en || detail.system_prompt_en) && (
              <div className="flex justify-center gap-1">
                <button
                  type="button"
                  onClick={() => setLang('zh')}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-[11px]',
                    lang === 'zh'
                      ? 'border-ink bg-canvas-soft text-ink'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {tModal('viewInChinese')}
                </button>
                <button
                  type="button"
                  onClick={() => setLang('en')}
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-[11px]',
                    lang === 'en'
                      ? 'border-ink bg-canvas-soft text-ink'
                      : 'border-border text-muted-foreground hover:bg-accent',
                  )}
                >
                  {tModal('viewInEnglish')}
                </button>
              </div>
            )}

            {/* system_prompt 全文 */}
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <p className="mb-1.5 text-[11px] font-medium uppercase text-muted-foreground">
                {tModal('systemPromptLabel')}
              </p>
              <p className="max-h-60 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                {displayPrompt}
              </p>
            </div>

            {/* 3 个按钮 */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowPicker(true);
                  void loadPicker();
                }}
                disabled={busy}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {tModal('switchAgent')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => void handleUnbind()} disabled={busy}>
                <Unlink className="h-3.5 w-3.5" />
                {tModal('unbindAgent')}
              </Button>
              {detail.editable && (
                <Button asChild variant="outline" size="sm" disabled={busy}>
                  <Link href={`/agents/${encodeURIComponent(detail.slug)}/edit` as never}>
                    <Pencil className="h-3.5 w-3.5" />
                    {tModal('editAgent')}
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
