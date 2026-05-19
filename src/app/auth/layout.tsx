import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { BRAND } from '@/lib/brand';

/**
 * Vercel-style auth shell — canvas-soft background + minimal wordmark.
 * The card itself lives in each /auth/* page.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4 py-12">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <Link
          href={'/' as never}
          className="group inline-flex items-center gap-2 text-foreground transition-opacity hover:opacity-70"
        >
          <Sparkles className="h-4 w-4 text-ink" />
          <span className="text-base font-semibold tracking-tight">{BRAND}</span>
        </Link>
        {children}
      </div>
    </div>
  );
}
