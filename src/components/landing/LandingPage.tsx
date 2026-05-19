'use client';

import { useState } from 'react';
import type { SystemStatus } from '@/lib/newapi-client';
import { LandingHeader } from './LandingHeader';
import { Hero } from './Hero';
import { Features } from './Features';
import { ModelsShowcase } from './ModelsShowcase';
import { AgentsShowcase } from './AgentsShowcase';
import { HowItWorks } from './HowItWorks';
import { Pricing } from './Pricing';
import { FAQ } from './FAQ';
import { Footer } from './Footer';
import { AuthModal } from '@/components/auth/AuthModal';

/**
 * Marketing landing page (M19).
 *
 * Composes all section components in reading order. Anonymous-only
 * route — the parent server page redirects logged-in visitors to
 * /welcome before this ever renders.
 *
 * Auth modal lives at the root level so any nested CTA can hoist it
 * via a shared `openAuth` callback prop without prop drilling.
 */
export function LandingPage({ status }: { status: SystemStatus }) {
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<'sign-in' | 'sign-up'>('sign-in');

  function openAuth(tab: 'sign-in' | 'sign-up') {
    setAuthTab(tab);
    setAuthOpen(true);
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <LandingHeader onOpenAuth={openAuth} />
      <main>
        <Hero onOpenAuth={openAuth} />
        <Features />
        <ModelsShowcase />
        <AgentsShowcase />
        <HowItWorks />
        <Pricing />
        <FAQ />
      </main>
      <Footer />
      <AuthModal
        open={authOpen}
        onOpenChange={setAuthOpen}
        defaultTab={authTab}
        emailVerificationRequired={
          (status as unknown as { email_verification?: boolean }).email_verification === true
        }
      />
    </div>
  );
}
