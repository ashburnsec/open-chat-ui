'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { SelfUser } from '@/lib/newapi-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Profile tab — change display_name and password. Username is fixed at
 * registration (changing it cascades through tokens, logs, OAuth bindings;
 * not worth the surface area). Email change is also out of scope here —
 * goes through admin or OAuth re-binding.
 */
export function ProfileTab({ user }: { user: SelfUser }) {
  const t = useTranslations('settings.profile');
  const tPwd = useTranslations('settings.security.password');
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h3 className="text-sm font-medium">{t('basicInfo')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('usernameLocked')}
            </p>
          </div>
          <DisplayNameForm initial={user.display_name || user.username} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-4 p-4">
          <div>
            <h3 className="text-sm font-medium">{tPwd('title')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {tPwd('hint')}
            </p>
          </div>
          <PasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}

function DisplayNameForm({ initial }: { initial: string }) {
  const t = useTranslations('settings.profile');
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (v.trim() === initial) return;
    setBusy(true);
    try {
      const r = await fetch('/api/newapi/api/user/self', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: v.trim() }),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('saveFailed'));
      toast.success(t('saved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-2">
      <Label htmlFor="dn">{t('displayNameLabel')}</Label>
      <div className="flex gap-2">
        <Input id="dn" value={v} onChange={(e) => setV(e.target.value)} maxLength={20} />
        <Button type="submit" disabled={busy || v.trim() === initial || !v.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('save')}
        </Button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const t = useTranslations('settings.security.password');
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd.length < 8) return toast.error(t('minLength'));
    if (newPwd !== confirm) return toast.error(t('mismatch'));
    setBusy(true);
    try {
      const r = await fetch('/api/newapi/api/user/self', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original_password: oldPwd, password: newPwd }),
      });
      const j = await r.json();
      if (!j?.success) throw new Error(j?.message || t('failed'));
      toast.success(t('changed'));
      setOldPwd('');
      setNewPwd('');
      setConfirm('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="op">{t('current')}</Label>
        <Input id="op" type="password" autoComplete="current-password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="np">{t('new')}</Label>
        <Input id="np" type="password" autoComplete="new-password" minLength={8} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cp">{t('confirm')}</Label>
        <Input id="cp" type="password" autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </div>
      <Button type="submit" disabled={busy || !oldPwd || !newPwd || newPwd !== confirm}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t('submit')}
      </Button>
    </form>
  );
}
