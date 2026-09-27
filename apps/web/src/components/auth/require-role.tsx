'use client';

import * as React from 'react';
import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import type { Role } from '@acsp/shared';
import { EmptyState } from '@/components/layout/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUser } from '@/hooks/use-user';

export interface RequireRoleProps {
  roles: readonly Role[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/** Client-side role gate for pages the sidebar hides from other roles. */
export function RequireRole({ roles, children, fallback }: RequireRoleProps) {
  const { data: user, isPending } = useUser();

  if (isPending) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    );
  }

  if (!user || !roles.includes(user.role)) {
    return (
      fallback ?? (
        <EmptyState
          icon={ShieldAlert}
          title="You need a higher access level"
          description="This area is limited to platform administrators. If you believe you should have access, ask your company admin."
          action={
            <Button asChild variant="outline">
              <Link href="/dashboard">Back to dashboard</Link>
            </Button>
          }
        />
      )
    );
  }

  return <>{children}</>;
}
