import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, formatCompact } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: number | string | null | undefined;
  icon: LucideIcon;
  /** One line under the value: period, limit, or where the number will come from. */
  hint?: string;
  loading?: boolean;
  className?: string;
}

/** Stat tile: sentence-case label, compact semibold value, optional hint. */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  loading = false,
  className,
}: StatCardProps) {
  const display =
    value === null || value === undefined
      ? '—'
      : typeof value === 'number'
        ? formatCompact(value)
        : value;

  return (
    <Card className={cn('gap-0 py-5', className)}>
      <CardContent className="px-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </div>
        <div className="mt-3">
          {loading ? (
            <Skeleton className="h-9 w-24" />
          ) : (
            <p className="text-3xl font-semibold tracking-tight">{display}</p>
          )}
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-3.5 w-36" />
        ) : hint ? (
          <p className="mt-1.5 truncate text-xs text-muted-foreground" title={hint}>
            {hint}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
