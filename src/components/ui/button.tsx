import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// M44 · Vercel DESIGN.md. 单一 ink 黑作 primary CTA; 6px sm radius 给 in-app
// 控件; 100px pill (size="pill") 给 marketing CTA. 两个 radius scale 故意共存
// 但不在同屏混用 (DESIGN.md Do's). hover 反馈克制 — 微变底色, 不靠阴影撑.
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] disabled:active:scale-100',
  {
    variants: {
      variant: {
        // primary = ink 黑 (—color-primary 现在 = ink). 唯一的 conversion 色.
        default: 'bg-primary text-primary-foreground hover:bg-primary/85',
        // secondary white pill — canvas + hairline 边.
        outline:
          'border border-border bg-background text-foreground hover:bg-muted hover:border-hairline-strong/40',
        ghost: 'text-foreground hover:bg-muted',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/85',
        // 链接走 Vercel link 蓝 #0070f3.
        link: 'text-link underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        default: 'h-9 px-3.5 py-2',
        sm: 'h-8 px-2.5 text-xs',
        lg: 'h-10 px-5',
        // icon-button-circular — 36x36 圆, toolbar / icon-only.
        icon: 'h-9 w-9 rounded-full',
        // marketing CTA — 100px pill, wide horizontal.
        pill: 'h-11 rounded-pill px-6 text-[15px]',
        // nav-scale pill — 小尺寸 pill, 用于 chip / 小 CTA.
        'pill-sm': 'h-8 rounded-pill px-4 text-xs',
        // composer send / stop — 44x44 圆.
        circle: 'h-11 w-11 rounded-full p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
    );
  },
);
Button.displayName = 'Button';
