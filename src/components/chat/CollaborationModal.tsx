'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { VendorMonogram } from '@/components/chat/VendorMonogram';
import {
  loadDynamicCatalog,
  visibleModels,
  type DynamicModel,
} from '@/lib/dynamic-catalog';
import { cn } from '@/lib/utils';

const MAX_COLLABORATORS = 3;

/**
 * M31-A: pick 1–3 collaborator models for the next send. The primary
 * model (set via the sidebar / composer pill) is excluded — picking it
 * as a collaborator would just duplicate its answer.
 *
 * Each card shows displayName + vendor monogram + the catalog
 * description. Selection is multi-select; cap at 3 to bound latency
 * (slowest collab + reducer ≈ user-visible wait).
 */
export function CollaborationModal({
  open,
  onOpenChange,
  primaryModel,
  availableModels,
  current,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  primaryModel: string;
  availableModels: readonly string[];
  current: string[];
  onConfirm: (next: string[]) => void;
}) {
  const t = useTranslations('chat.collaboration');
  const [picked, setPicked] = useState<string[]>(current);
  const [catalog, setCatalog] = useState<DynamicModel[] | null>(null);

  // Reset local state whenever the modal opens so a "cancel" doesn't
  // leave stale picks lingering for the next time. Keyed on `open` so
  // we don't reset mid-session if the parent re-renders.
  useMemo(() => {
    if (open) setPicked(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // M34: pull dynamic catalog (newapi + admin overrides + hardcode)
  // once the modal opens. The legacy `availableModels` prop (string[])
  // is still accepted as the "what newapi can route" snapshot — we
  // intersect it with the dynamic catalog so a stale/cached prop doesn't
  // surface a model that's been removed upstream.
  useEffect(() => {
    if (!open || catalog) return;
    let cancelled = false;
    void loadDynamicCatalog().then((entries) => {
      if (!cancelled) setCatalog(entries);
    });
    return () => {
      cancelled = true;
    };
  }, [open, catalog]);

  // Filter rules:
  //   - chat / code only (image/video/audio go through dedicated flows)
  //   - drop the primary model itself (collaboration would dup-answer)
  //   - drop admin-disabled models (visibleModels)
  //   - intersect with the prop list so a removed upstream doesn't show
  const candidates = useMemo<DynamicModel[]>(() => {
    if (!catalog) return [];
    const allowed = new Set(availableModels);
    return visibleModels(catalog).filter(
      (m) =>
        (m.category === 'chat' || m.category === 'code') &&
        m.id !== primaryModel &&
        allowed.has(m.id),
    );
  }, [catalog, availableModels, primaryModel]);

  function toggle(id: string) {
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((m) => m !== id);
      if (prev.length >= MAX_COLLABORATORS) return prev;
      return [...prev, id];
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('modalTitle')}</DialogTitle>
          <DialogDescription>
            {t('modalDescription', { max: MAX_COLLABORATORS })}
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
          {candidates.length === 0 ? (
            <p className="col-span-full px-2 py-8 text-center text-sm text-muted-foreground">
              {t('emptyAvailable')}
            </p>
          ) : (
            candidates.map((m) => {
              const active = picked.includes(m.id);
              const disabled =
                !active && picked.length >= MAX_COLLABORATORS;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  disabled={disabled}
                  className={cn(
                    'flex items-start gap-3 rounded-md border p-3 text-left transition-colors',
                    active
                      ? 'border-ink bg-canvas-soft'
                      : 'border-border bg-card hover:bg-accent/40',
                    disabled && 'opacity-40',
                  )}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted/40">
                    <VendorMonogram model={m.id} size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {m.displayName}
                      </span>
                      {active && (
                        <Check className="h-4 w-4 shrink-0 text-ink" />
                      )}
                    </div>
                    {m.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {m.description}
                      </p>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t('latencyHint')}</p>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setPicked([]);
              onConfirm([]);
              onOpenChange(false);
            }}
            disabled={picked.length === 0 && current.length === 0}
          >
            {t('clear')}
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onConfirm(picked);
                onOpenChange(false);
              }}
            >
              {t('confirm', { n: picked.length })}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
