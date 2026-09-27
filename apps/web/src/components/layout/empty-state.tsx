import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  /** Roadmap label, e.g. "Phase 2 · Websites & projects". */
  phase?: string;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  phase,
  className,
}: EmptyStateProps) {
  return (
    <section
      aria-label={title}
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-card/60 px-6 py-16 text-center md:py-20',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
      />
      <div className="relative">
        <div className="mx-auto mb-5 grid size-14 place-items-center rounded-2xl bg-brand-gradient p-px shadow-lg shadow-primary/20">
          <div className="grid size-full place-items-center rounded-[calc(1rem-1px)] bg-card">
            <Icon className="size-6 text-primary" aria-hidden="true" />
          </div>
        </div>
        {phase ? (
          <Badge variant="secondary" className="mb-3">
            {phase}
          </Badge>
        ) : null}
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
        {action ? <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div> : null}
      </div>
    </section>
  );
}
