'use client';

import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * Programmatic confirm dialog. Replaces the browser's `confirm()` for
 * destructive actions so we can style consistently and i18n-ize.
 *
 * Usage (in a Client Component anywhere under <ConfirmProvider>):
 *
 *   const confirm = useConfirm();
 *   async function onDelete() {
 *     const ok = await confirm({
 *       title: t('deleteTitle'),
 *       description: t('deleteHint'),
 *       confirmLabel: t('delete'),
 *       variant: 'destructive',
 *     });
 *     if (!ok) return;
 *     // ... actually delete
 *   }
 *
 * The provider keeps a single dialog instance — concurrent calls
 * resolve `false` for the older one before opening the new prompt,
 * so a stuck dialog can't pile up.
 */

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'destructive';
};

type Resolver = (ok: boolean) => void;

const ConfirmContext = React.createContext<((opts: ConfirmOptions) => Promise<boolean>) | null>(
  null,
);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [opts, setOpts] = React.useState<ConfirmOptions | null>(null);
  // Resolver lives in a ref so consecutive `confirm()` calls (rare but
  // possible if a button gets double-clicked) don't lose their previous
  // promise — we settle it as `false` before opening the next one.
  const resolverRef = React.useRef<Resolver | null>(null);

  const confirm = React.useCallback(
    (next: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        // Cancel any previous in-flight prompt.
        resolverRef.current?.(false);
        resolverRef.current = resolve;
        setOpts(next);
        setOpen(true);
      }),
    [],
  );

  // When the dialog state flips to closed without an explicit
  // confirm/cancel click (e.g. ESC, overlay click), resolve as `false`.
  function handleOpenChange(next: boolean) {
    if (!next && resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    setOpen(next);
  }

  function settle(ok: boolean) {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setOpen(false);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
            {opts?.description && (
              <AlertDialogDescription>{opts.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {opts?.cancelLabel ?? 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              variant={opts?.variant ?? 'default'}
              onClick={() => settle(true)}
            >
              {opts?.confirmLabel ?? 'OK'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm must be used inside <ConfirmProvider>');
  }
  return ctx;
}
