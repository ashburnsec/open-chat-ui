import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getCurrentUser } from '@/lib/auth';
import { getStatus } from '@/lib/status';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileTab } from '@/components/settings/ProfileTab';
import { SecurityTab } from '@/components/settings/SecurityTab';
import { InviteTab } from '@/components/settings/InviteTab';
import { LanguageCard } from '@/components/settings/LanguageCard';

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/auth/sign-in' as never);
  const status = await getStatus();
  const t = await getTranslations('settings');
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <Tabs defaultValue="profile">
          <TabsList>
            <TabsTrigger value="profile">{t('tabs.profile')}</TabsTrigger>
            <TabsTrigger value="security">{t('tabs.security')}</TabsTrigger>
            <TabsTrigger value="preferences">{t('tabs.preferences')}</TabsTrigger>
            <TabsTrigger value="invite">{t('tabs.invite')}</TabsTrigger>
          </TabsList>
          <TabsContent value="profile">
            <ProfileTab user={user} />
          </TabsContent>
          <TabsContent value="security">
            <SecurityTab />
          </TabsContent>
          <TabsContent value="preferences">
            <LanguageCard />
          </TabsContent>
          <TabsContent value="invite">
            <InviteTab user={user} quotaPerUnit={status.quota_per_unit || 500000} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
