'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

export function LogoutButton() {
  const router = useRouter();
  const t = useTranslations('common');
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setBusy(false);
      // M19: bounce to landing page after sign-out (it carries the auth modal CTAs).
      router.replace('/' as never);
      router.refresh();
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={busy}>
      {busy ? t('signingOut') : t('signOut')}
    </Button>
  );
}
