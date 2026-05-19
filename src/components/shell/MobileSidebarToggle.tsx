'use client';

import { useTranslations } from 'next-intl';
import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { SidebarBody } from '@/components/shell/AppSidebar';

/**
 * Hamburger button + slide-in sheet, mobile-only. Rendered inside the
 * top nav. The trigger is `md:hidden` so it disappears on tablet+ where
 * the desktop sidebar is fully visible.
 *
 * `isAdmin` is accepted for API parity with the previous shape but no
 * longer drives any rendering — admin-only nav lives in TopNav's user
 * menu now.
 */
export function MobileSidebarToggle({
  systemName,
}: {
  systemName: string;
  isAdmin?: boolean;
}) {
  const t = useTranslations('nav');
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={t('openSidebar')}
          className="-ml-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="flex flex-col p-0">
        <SidebarBody systemName={systemName} drawer />
      </SheetContent>
    </Sheet>
  );
}
