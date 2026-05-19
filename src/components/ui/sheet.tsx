'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Minimal shadcn-style Sheet built on Radix Dialog. Just enough surface
 * area for the mobile sidebar — full shadcn Sheet adds richer animations
 * and side variants we don't need yet.
 */

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    side?: 'left' | 'right';
  }
>(({ className, side = 'left', children, ...props }, ref) => {
  const tCommon = useTranslations('common');
  const tNav = useTranslations('nav.workspace');
  return (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // M44 · Vercel — canvas 底 + Level 4 stacked shadow + hairline 边.
          'fixed inset-y-0 z-50 flex w-72 flex-col gap-4 bg-canvas shadow-[var(--shadow-4)] outline-none',
          side === 'left' ? 'left-0 border-r border-hairline' : 'right-0 border-l border-hairline',
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Close
          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-sm text-mute transition-colors hover:bg-muted hover:text-ink"
          aria-label={tCommon('close')}
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
        <DialogPrimitive.Title className="sr-only">{tNav('title')}</DialogPrimitive.Title>
        {children}
      </DialogPrimitive.Content>
    </SheetPortal>
  );
});
SheetContent.displayName = DialogPrimitive.Content.displayName;
