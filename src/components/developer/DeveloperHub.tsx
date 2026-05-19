'use client';

import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { KeysPanel } from '@/components/billing/KeysPanel';
import { HowToPanel } from './HowToPanel';
import { ModelPricingTable } from './ModelPricingTable';

/**
 * Developer hub — three-tab dashboard sitting on `/keys`. Tab 1 is the
 * existing self-service token CRUD; Tab 2 is the "wire it up to your CLI"
 * guide (M22-D2); Tab 3 is the read-only model pricing table (M22-D3).
 *
 * URL stays `/keys` so existing bookmarks/links keep working. The sidebar
 * label is already "API" — semantically fine for the hub.
 */
export function DeveloperHub({ quotaPerUnit }: { quotaPerUnit: number }) {
  const t = useTranslations('developer');
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          {t('title')}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>

      <Tabs defaultValue="tokens" className="w-full">
        <TabsList className="h-10 w-full justify-start gap-1 rounded-md bg-muted/60 p-1 md:w-auto">
          <TabsTrigger value="tokens" className="rounded-lg px-4">
            {t('tabs.tokens')}
          </TabsTrigger>
          <TabsTrigger value="howto" className="rounded-lg px-4">
            {t('tabs.howto')}
          </TabsTrigger>
          <TabsTrigger value="models" className="rounded-lg px-4">
            {t('tabs.models')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tokens" className="mt-6">
          <KeysPanel quotaPerUnit={quotaPerUnit} embedded />
        </TabsContent>

        <TabsContent value="howto" className="mt-6">
          <HowToPanel />
        </TabsContent>

        <TabsContent value="models" className="mt-6">
          <ModelPricingTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
