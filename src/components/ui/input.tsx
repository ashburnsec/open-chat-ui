import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        // M44 · Vercel form-input — 40px 高, 6px sm radius, hairline 边, canvas 底.
        'flex h-10 w-full rounded-sm border border-hairline bg-canvas px-3 py-1 text-sm text-ink transition-colors duration-150',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'placeholder:text-mute',
        // focus: 边变 ink + 细 ink ring (Vercel 用 ink 不用紫).
        'focus-visible:outline-none focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ring/15',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
