import type { Metadata } from 'next';
import { ChartColumn } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { ROADMAP } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Analytics',
};

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Rankings, clicks and impressions from Google Search Console joined to the content that earned them."
        actions={
          <Button variant="outline" disabled title="Available in Phase 6">
            Connect Search Console
          </Button>
        }
      />
      <EmptyState
        icon={ChartColumn}
        phase={ROADMAP.analytics}
        title="No performance data yet"
        description="Once Search Console is connected and articles are live, this page tracks keyword positions, traffic per article and content ROI over time."
      />
    </>
  );
}
