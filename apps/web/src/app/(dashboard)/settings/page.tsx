import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { SettingsTabs } from '@/components/settings/settings-tabs';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata: Metadata = {
  title: 'Settings',
};

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Manage your profile, company, team, integrations and billing."
      />
      <Suspense
        fallback={
          <div className="space-y-4" aria-busy="true">
            <Skeleton className="h-10 w-full max-w-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        }
      >
        <SettingsTabs />
      </Suspense>
    </>
  );
}
