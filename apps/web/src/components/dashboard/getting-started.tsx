'use client';

import Link from 'next/link';
import { ArrowRight, Check, Circle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { CompanyUsage } from '@/hooks/use-company';

interface Step {
  id: string;
  title: string;
  description: string;
  href: string;
  done: boolean;
}

export interface GettingStartedProps {
  usage?: CompanyUsage;
  loading?: boolean;
}

export function GettingStarted({ usage, loading = false }: GettingStartedProps) {
  const steps: Step[] = [
    {
      id: 'workspace',
      title: 'Create your workspace',
      description: 'Your company and admin account are set up.',
      href: '/settings',
      done: true,
    },
    {
      id: 'website',
      title: 'Add your first website',
      description: 'Connect a domain, describe your brand voice and audience.',
      href: '/websites',
      done: (usage?.used.websites ?? 0) > 0,
    },
    {
      id: 'project',
      title: 'Create a project',
      description: 'Pick goals, topics, competitors and target locales.',
      href: '/projects',
      done: (usage?.used.projects ?? 0) > 0,
    },
    {
      id: 'keywords',
      title: 'Run keyword research',
      description: 'Let the agent discover, score and cluster opportunities.',
      href: '/projects',
      done: false,
    },
    {
      id: 'article',
      title: 'Generate your first article',
      description: 'From strategy-backed brief to SEO-ready draft.',
      href: '/content',
      done: false,
    },
    {
      id: 'publish',
      title: 'Connect WordPress and publish',
      description: 'Schedule on the calendar and push it live.',
      href: '/settings?tab=integrations',
      done: false,
    },
  ];

  const doneCount = steps.filter((step) => step.done).length;
  const percent = Math.round((doneCount / steps.length) * 100);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <CardTitle>Getting started</CardTitle>
            <CardDescription>
              Six steps from empty workspace to your first published article.
            </CardDescription>
          </div>
          <span className="shrink-0 text-sm font-medium text-muted-foreground">
            {loading ? <Skeleton className="h-4 w-10" /> : `${doneCount} / ${steps.length}`}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={doneCount}
          className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-primary/15"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </CardHeader>
      <CardContent>
        <ol className="divide-y">
          {steps.map((step, index) => (
            <li key={step.id}>
              <Link
                href={step.href}
                className={cn(
                  'group -mx-2 flex items-center gap-4 rounded-lg px-2 py-3 outline-none transition-colors',
                  'hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/60',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-full border text-xs font-semibold transition-colors',
                    step.done
                      ? 'border-success bg-success text-white'
                      : 'border-border bg-background text-muted-foreground group-hover:border-primary/50',
                  )}
                >
                  {loading ? (
                    <Circle className="size-3 animate-pulse" />
                  ) : step.done ? (
                    <Check className="size-3.5" strokeWidth={3} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-sm font-medium',
                      step.done &&
                        'text-muted-foreground line-through decoration-muted-foreground/50',
                    )}
                  >
                    {step.title}
                    <span className="sr-only">{step.done ? ' — done' : ' — to do'}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {step.description}
                  </span>
                </span>
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                />
              </Link>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
