'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, User, Lock } from 'lucide-react';
import { toast } from 'sonner';
import type { SelfUser } from '@/lib/newapi-client';
import { Button } from '@/components/ui/button';
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
      {/* Basic info section */}
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-100 dark:bg-blue-950">
            <User className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold leading-tight">{t('basicInfo')}</h3>
            <p className="text-[11px] text-muted-foreground">{t('usernameLocked')}</p>
          </div>
        </div>
        <div className="p-4">
          <DisplayNameForm initial={user.display_name || user.username} />
        </div>
      </div>

      {/* Password section */}
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-950">
            <Lock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-[13px] font-semibold leading-tight">{tPwd('title')}</h3>
            <p className="text-[11px] text-muted-foreground">{tPwd('hint')}</p>
          </div>
        </div>
        <div className="p-4">
          <PasswordForm />
        </div>
      </div>
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
