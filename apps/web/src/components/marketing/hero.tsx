'use client';

import Link from 'next/link';
import { motion, type Variants } from 'framer-motion';
import { ArrowRight, Check, Send, Sparkles, TrendingUp, type LucideIcon } from 'lucide-react';
import { PLAN_LIMITS } from '@acsp/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn, formatNumber } from '@/lib/utils';

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.11, delayChildren: 0.1 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] } },
};

export function Hero() {
  return (
    <section className="relative overflow-hidden pt-32 pb-20 md:pt-40 md:pb-28">
      <Orbs />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-grid opacity-40 [mask-image:radial-gradient(ellipse_at_top,black_25%,transparent_70%)]"
      />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
      >
        <div className="mx-auto max-w-3xl text-center">
          <motion.div variants={item} className="flex justify-center">
            <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1 text-xs">
              <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
              Now in private beta
            </Badge>
          </motion.div>

          <motion.h1
            variants={item}
            className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl md:text-6xl md:leading-[1.05]"
          >
            Turn keywords into{' '}
            <span className="text-gradient animate-gradient">published content</span>,
            automatically.
          </motion.h1>

          <motion.p
            variants={item}
            className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground text-pretty"
          >
            Research keywords, plan the strategy, generate and edit articles with AI agents,
            repurpose them for every channel, publish on schedule and watch the rankings move — from
            one workspace built for teams and agencies.
          </motion.p>

          <motion.div
            variants={item}
            className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
          >
            <Button asChild size="lg" variant="gradient" className="w-full sm:w-auto">
              <Link href="/register">
                Start for free
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <Link href="/#how-it-works">See how it works</Link>
            </Button>
          </motion.div>

          <motion.ul
            variants={item}
            className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground"
          >
            {[
              'No credit card required',
              `${formatNumber(PLAN_LIMITS.FREE.wordsPerMonth)} free words every month`,
              'Cancel anytime',
            ].map((text) => (
              <li key={text} className="flex items-center gap-1.5">
                <Check className="size-4 text-success" aria-hidden="true" />
                {text}
              </li>
            ))}
          </motion.ul>
        </div>

        <motion.div variants={item} className="relative mx-auto mt-16 max-w-5xl md:mt-20">
          <DashboardPreview />
        </motion.div>
      </motion.div>
    </section>
  );
}

function Orbs() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <motion.div
        className="absolute -top-40 left-[calc(50%-16rem)] size-[32rem] rounded-full bg-brand-start/25 blur-3xl dark:bg-brand-start/20"
        animate={{ y: [0, -24, 0], x: [0, 14, 0] }}
        transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute top-48 -left-28 size-80 rounded-full bg-brand-end/20 blur-3xl dark:bg-brand-end/15"
        animate={{ y: [0, 28, 0] }}
        transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
      />
      <motion.div
        className="absolute top-64 -right-24 size-96 rounded-full bg-brand-mid/20 blur-3xl dark:bg-brand-mid/15"
        animate={{ y: [0, -20, 0], x: [0, -18, 0] }}
        transition={{ duration: 17, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />
    </div>
  );
}

/** Decorative product mock — purely visual, hidden from assistive tech. */
function DashboardPreview() {
  const bars = [38, 44, 41, 52, 49, 58, 63, 60, 70, 74, 79, 92];
  const pipeline = [
    { label: 'Brief ready', detail: 'best crm for startups', tone: 'bg-primary' },
    { label: 'Draft generating', detail: 'saas onboarding checklist', tone: 'bg-warning' },
    { label: 'Scheduled', detail: 'email deliverability guide', tone: 'bg-success' },
  ];

  return (
    <div className="relative" aria-hidden="true">
      <div className="absolute -inset-1 -z-10 rounded-[1.25rem] bg-brand-gradient opacity-25 blur-2xl dark:opacity-30" />

      <div className="overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-primary/10">
        <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-destructive/60" />
          <span className="size-2.5 rounded-full bg-warning/70" />
          <span className="size-2.5 rounded-full bg-success/70" />
          <div className="ml-3 flex h-5 max-w-xs flex-1 items-center rounded-md bg-background/80 px-2 text-[10px] text-muted-foreground">
            app.contentengine.io/dashboard
          </div>
        </div>

        <div className="grid grid-cols-[3.25rem_1fr] sm:grid-cols-[10rem_1fr]">
          <aside className="space-y-2 border-r bg-sidebar p-3">
            <div className="mb-4 flex items-center gap-2">
              <span className="size-6 rounded-md bg-brand-gradient" />
              <span className="hidden h-2 w-16 rounded bg-foreground/20 sm:block" />
            </div>
            {[true, false, false, false, false, false].map((active, index) => (
              <div
                key={index}
                className={cn(
                  'flex items-center gap-2 rounded-md px-1.5 py-1.5',
                  active && 'bg-sidebar-accent',
                )}
              >
                <span
                  className={cn('size-3.5 rounded-sm', active ? 'bg-primary' : 'bg-foreground/15')}
                />
                <span
                  className={cn(
                    'hidden h-2 rounded sm:block',
                    active ? 'w-14 bg-foreground/50' : 'w-12 bg-foreground/15',
                  )}
                />
              </div>
            ))}
          </aside>

          <div className="space-y-4 p-4 sm:p-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Keywords', value: '1,284' },
                { label: 'Drafts', value: '36' },
                { label: 'Published', value: '212' },
                { label: 'AI credits', value: '2.1K' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border bg-background p-3">
                  <p className="text-[10px] font-medium text-muted-foreground">{stat.label}</p>
                  <p className="mt-1 text-lg font-semibold tracking-tight">{stat.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-background p-4 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">Organic clicks</p>
                  <p className="text-[10px] text-muted-foreground">Last 12 weeks</p>
                </div>
                <div className="mt-4 flex h-24 items-end gap-1.5">
                  {bars.map((height, index) => (
                    <div
                      key={index}
                      className={cn(
                        'flex-1 rounded-t-[3px]',
                        index === bars.length - 1 ? 'bg-primary' : 'bg-primary/25',
                      )}
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs font-medium">Pipeline</p>
                <ul className="mt-3 space-y-2.5">
                  {pipeline.map((row) => (
                    <li key={row.label} className="flex items-start gap-2">
                      <span className={cn('mt-1 size-2 shrink-0 rounded-full', row.tone)} />
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium">{row.label}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{row.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>

      <FloatingChip
        icon={Sparkles}
        label="Brief ready"
        detail="“Best CRM for startups”"
        className="top-24 -left-6 hidden lg:flex"
        delay={0}
      />
      <FloatingChip
        icon={Send}
        label="Published"
        detail="WordPress · just now"
        className="top-8 -right-8 hidden lg:flex"
        delay={1.4}
      />
      <FloatingChip
        icon={TrendingUp}
        label="+38% clicks"
        detail="vs. last month"
        className="-right-4 bottom-14 hidden lg:flex"
        delay={2.6}
      />
    </div>
  );
}

function FloatingChip({
  icon: Icon,
  label,
  detail,
  className,
  delay,
}: {
  icon: LucideIcon;
  label: string;
  detail: string;
  className?: string;
  delay: number;
}) {
  return (
    <motion.div
      className={cn(
        'absolute items-center gap-3 rounded-xl border bg-card/95 px-3.5 py-2.5 shadow-lg shadow-primary/10 backdrop-blur',
        className,
      )}
      animate={{ y: [0, -8, 0] }}
      transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut', delay }}
    >
      <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <span>
        <span className="block text-xs font-semibold">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{detail}</span>
      </span>
    </motion.div>
  );
}
