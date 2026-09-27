import type { Metadata } from 'next';
import { FileText, Sparkles } from 'lucide-react';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { ROADMAP } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Content',
};

export default function ContentPage() {
  return (
    <>
      <PageHeader
        title="Content"
        description="Briefs, AI drafts, reviews and published pieces — every status from BRIEF to PUBLISHED in one queue."
        actions={
          <Button disabled title="Available in Phase 3">
            <Sparkles />
            Generate article
          </Button>
        }
      />
      <EmptyState
        icon={FileText}
        phase={ROADMAP.contentGeneration}
        title="Your content library is empty"
        description="Generation lands in Phase 3 (briefs and long-form drafts) and the editor with inline AI actions and the SEO analyzer follows in Phase 4."
      />
    </>
  );
}
