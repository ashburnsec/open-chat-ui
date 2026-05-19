import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * M44 · Vercel card-marketing-large 替代了原 iOS-26 frosted-glass.
 *
 * 历史: M19 landing 用 backdrop-blur + white/55 + saturate-150 做毛玻璃, 跟暖
 * 米色 hero 配. M44 全站换 Vercel 黑白克制风后, glass 跟新调性冲突 - 改成
 * Vercel card-marketing 8 md radius + Level 3 stacked shadow + hairline.
 * 文件保留为了不破 AgentsShowcase/Pricing/Features/FAQ/ModelsShowcase 引用.
 *
 *   <GlassCard className="p-6">…</GlassCard>
 */
export const GlassCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      // Vercel card-marketing: canvas + hairline + Level 3 shadow + 8 md.
      'rounded-md border border-hairline bg-canvas shadow-[var(--shadow-3)]',
      className,
    )}
    {...props}
  />
));
GlassCard.displayName = 'GlassCard';
