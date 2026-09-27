import type { Metadata } from 'next';
import Link from 'next/link';
import { FolderKanban, Plus } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { ROADMAP } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Projects',
};

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Projects"
        description="A project groups a website's keyword clusters, strategy and briefs around one campaign or topic."
        actions={
          <Button disabled title="Available in Phase 2">
            <Plus />
            New project
          </Button>
        }
      />
      <EmptyState
        icon={FolderKanban}
        phase={ROADMAP.websitesProjects}
        title="No projects yet"
        description="Projects arrive with the websites module: define goals, audience, competitors and locales, then run keyword research and build a content strategy inside each one."
        action={
          <Button asChild variant="outline">
            <Link href="/websites">Start with a website</Link>
          </Button>
        }
      />
    </>
  );
}
