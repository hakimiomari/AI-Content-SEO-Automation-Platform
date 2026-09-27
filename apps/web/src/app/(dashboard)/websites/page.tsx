import type { Metadata } from 'next';
import { Globe, Plus } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { ROADMAP } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Websites',
};

export default function WebsitesPage() {
  return (
    <>
      <PageHeader
        title="Websites"
        description="Each website carries its own brand voice, audience profile and publishing integrations."
        actions={
          <Button disabled title="Available in Phase 2">
            <Plus />
            Add website
          </Button>
        }
      />
      <EmptyState
        icon={Globe}
        phase={ROADMAP.websitesProjects}
        title="Connect your first website"
        description="Add a domain and the website-analysis agent will crawl it to infer tone, topics and competitors — the foundation every project and article builds on."
        action={<Button disabled>Add website</Button>}
      />
    </>
  );
}
