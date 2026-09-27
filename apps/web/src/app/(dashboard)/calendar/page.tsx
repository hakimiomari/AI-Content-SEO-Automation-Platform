import type { Metadata } from 'next';
import { CalendarDays } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { ROADMAP } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Calendar',
};

export default function CalendarPage() {
  return (
    <>
      <PageHeader
        title="Calendar"
        description="Plan the month, drag drafts onto dates and publish to WordPress and social channels automatically."
        actions={
          <Button variant="outline" disabled title="Available in Phase 5">
            Schedule content
          </Button>
        }
      />
      <EmptyState
        icon={CalendarDays}
        phase={ROADMAP.publishing}
        title="Nothing scheduled"
        description="The publishing calendar ships with repurposing: approve an article, generate its social variants and schedule everything across channels from one view."
      />
    </>
  );
}
