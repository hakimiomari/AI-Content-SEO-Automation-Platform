import type { Metadata } from 'next';
import { FileChartColumn } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { ROADMAP } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Reports',
};

export default function ReportsPage() {
  return (
    <>
      <PageHeader
        title="Reports"
        description="Scheduled, shareable summaries of SEO and content performance — white-label on the Agency plan."
        actions={
          <Button variant="outline" disabled title="Available in Phase 6">
            New report
          </Button>
        }
      />
      <EmptyState
        icon={FileChartColumn}
        phase={ROADMAP.analytics}
        title="No reports generated"
        description="Reports are produced by the report agent from analytics data: weekly or monthly PDFs and share links your clients can open without an account."
      />
    </>
  );
}
