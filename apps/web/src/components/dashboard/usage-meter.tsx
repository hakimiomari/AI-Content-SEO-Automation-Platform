import { TriangleAlert } from 'lucide-react';
import { clampPercent, cn, formatCompact } from '@/lib/utils';

export interface UsageMeterProps {
  label: string;
  used: number;
  limit: number;
  className?: string;
}

/**
 * Single ratio against a limit. The fill carries severity (accent → warning →
 * danger at 75% / 90%) and the track is a lighter step of the same hue, so the
 * state reads across the whole bar. Numbers stay in text tokens.
 */
export function UsageMeter({ label, used, limit, className }: UsageMeterProps) {
  const percent = clampPercent(used, limit);
  const tone = percent >= 90 ? 'critical' : percent >= 75 ? 'warning' : 'ok';

  const fill = {
    ok: 'bg-primary',
    warning: 'bg-warning',
    critical: 'bg-destructive',
  }[tone];
  const track = {
    ok: 'bg-primary/15',
    warning: 'bg-warning/20',
    critical: 'bg-destructive/15',
  }[tone];

  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">
          {formatCompact(used)} / {formatCompact(limit)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={`${label} used`}
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={Math.min(used, limit)}
        aria-valuetext={`${percent}% of ${label.toLowerCase()} used`}
        className={cn('mt-1.5 h-1.5 w-full overflow-hidden rounded-full', track)}
      >
        <div
          className={cn('h-full rounded-full transition-[width] duration-500 ease-out', fill)}
          style={{ width: `${percent}%` }}
        />
      </div>
      {tone === 'ok' ? null : (
        <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <TriangleAlert className="size-3" aria-hidden="true" />
          {tone === 'critical' ? 'Almost at your limit' : 'Approaching your limit'}
        </p>
      )}
    </div>
  );
}
