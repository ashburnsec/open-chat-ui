'use client';

import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SignInForm } from '@/app/auth/sign-in/sign-in-form';
import { SignUpForm } from '@/app/auth/sign-up/sign-up-form';

/**
 * In-page sign-in / sign-up modal (M19). Replaces the dedicated
 * /auth/sign-in landing for unauthenticated visitors arriving from
 * the marketing landing page.
 *
 * Why direct reuse of `SignInForm` / `SignUpForm` works without
 * extracting field-only sub-components:
 *   - on success they call `router.replace('/')` + `router.refresh()`
 *   - the root server component re-checks auth, sees the new session,
 *     `redirect('/welcome')` fires
 *   - the browser navigates → this modal unmounts naturally,
 *     no manual close handling required.
 *
 * Both forms are also still mounted by the standalone /auth/sign-in
 * and /auth/sign-up pages so direct links keep working.
 */
export function AuthModal({
  open,
  onOpenChange,
  defaultTab = 'sign-in',
  emailVerificationRequired,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: 'sign-in' | 'sign-up';
  /** Mirrors the SignUpForm prop — comes from system status. */
  emailVerificationRequired: boolean;
}) {
  const t = useTranslations('auth');
  const tLanding = useTranslations('landing.header');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-md">
        <DialogTitle className="font-display text-xl">{tLanding('brand')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('signIn.cardSubtitle')}
        </DialogDescription>
        <Tabs defaultValue={defaultTab} className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="sign-in">{t('signIn.submit')}</TabsTrigger>
            <TabsTrigger value="sign-up">{t('signUp.submit')}</TabsTrigger>
          </TabsList>
          <TabsContent value="sign-in" className="mt-4">
            <SignInForm />
          </TabsContent>
          <TabsContent value="sign-up" className="mt-4">
            <SignUpForm emailVerificationRequired={emailVerificationRequired} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
