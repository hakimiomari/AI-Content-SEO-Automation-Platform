'use client';

import Link from 'next/link';
import { FileText, Plus, RefreshCw, Search, Send, Sparkles, TriangleAlert } from 'lucide-react';
import { GettingStarted } from '@/components/dashboard/getting-started';
import { RecentActivity } from '@/components/dashboard/recent-activity';
import { StatCard } from '@/components/dashboard/stat-card';
import { UsageMeter } from '@/components/dashboard/usage-meter';
import { PageHeader } from '@/components/layout/page-header';
import { PlanBadge } from '@/components/plan-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompanyUsage } from '@/hooks/use-company';
import { useUser } from '@/hooks/use-user';
import { formatCompact, formatShortDate } from '@/lib/utils';

export function DashboardOverview() {
  const { data: user } = useUser();
  const usageQuery = useCompanyUsage();
  const { data: usage, isPending, isError, refetch, isRefetching } = usageQuery;

  const firstName = user?.name?.trim().split(/\s+/)[0];
  const periodEnd = usage ? formatShortDate(usage.periodEnd) : '';

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
        description="Here is where your content engine stands. Finish the checklist to unlock your first article."
        badge={user?.company ? <PlanBadge plan={user.company.plan} /> : null}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/websites">
                <Plus />
                Add website
              </Link>
            </Button>
            <Button asChild variant="gradient">
              <Link href="/projects">
                <Sparkles />
                New project
              </Link>
            </Button>
          </>
        }
      />

      {isError ? (
        <div
          role="alert"
          className="mb-6 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm sm:flex-row sm:items-center"
        >
          <TriangleAlert className="size-4 shrink-0 text-foreground" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-medium">Usage data is unavailable</p>
            <p className="text-muted-foreground">
              {usageQuery.error?.message ?? 'The API did not respond.'} Stats below show
              placeholders until it does.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={isRefetching ? 'animate-spin' : undefined} />
            Retry
          </Button>
        </div>
      ) : null}

      <section aria-label="Key metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Keywords tracked"
          value={0}
          icon={Search}
          hint="Populates after your first keyword research run"
          loading={isPending}
        />
        <StatCard
          label="Content drafts"
          value={0}
          icon={FileText}
          hint="AI-generated drafts waiting for review"
          loading={isPending}
        />
        <StatCard
          label="Published"
          value={0}
          icon={Send}
          hint="Articles and posts pushed live this period"
          loading={isPending}
        />
        <StatCard
          label="AI credits used"
          value={usage ? usage.used.aiCredits : isError ? '—' : undefined}
          icon={Sparkles}
          hint={
            usage
              ? `of ${formatCompact(usage.limits.aiCreditsPerMonth)} on ${usage.limits.name}${periodEnd ? ` · resets ${periodEnd}` : ''}`
              : undefined
          }
          loading={isPending}
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <GettingStarted usage={usage} loading={isPending} />
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <CardTitle>Plan usage</CardTitle>
                  <CardDescription>
                    {periodEnd ? `Resets ${periodEnd}` : 'Current billing period'}
                  </CardDescription>
                </div>
                {usage ? <PlanBadge plan={usage.plan} /> : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isPending ? (
                <>
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </>
              ) : usage ? (
                <>
                  <UsageMeter
                    label="Words"
                    used={usage.used.words}
                    limit={usage.limits.wordsPerMonth}
                  />
                  <UsageMeter
                    label="AI credits"
                    used={usage.used.aiCredits}
                    limit={usage.limits.aiCreditsPerMonth}
                  />
                  <UsageMeter
                    label="Websites"
                    used={usage.used.websites}
                    limit={usage.limits.websites}
                  />
                  <UsageMeter
                    label="Projects"
                    used={usage.used.projects}
                    limit={usage.limits.projects}
                  />
                  <UsageMeter
                    label="Team seats"
                    used={usage.used.users}
                    limit={usage.limits.users}
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Usage will appear once the API is reachable.
                </p>
              )}
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href="/settings?tab=billing">Manage plan</Link>
              </Button>
            </CardContent>
          </Card>
          <RecentActivity />
        </div>
      </div>
    </>
  );
}
