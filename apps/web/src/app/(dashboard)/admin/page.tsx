import type { Metadata } from 'next';
import { ShieldCheck } from 'lucide-react';
import { RequireRole } from '@/components/auth/require-role';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { ROADMAP } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Admin',
};

export default function AdminPage() {
  return (
    <RequireRole roles={['SUPER_ADMIN']}>
      <PageHeader
        title="Platform admin"
        description="Cross-tenant view of companies, subscriptions, AI usage and audit logs."
        badge={<Badge variant="gradient">Super admin</Badge>}
      />
      <EmptyState
        icon={ShieldCheck}
        phase={ROADMAP.billingAdmin}
        title="Admin console coming soon"
        description="Impersonate tenants with ?companyId, adjust plans, review AI spend per company and export audit logs. Until then, use the API's /admin endpoints directly."
      />
    </RequireRole>
  );
}
