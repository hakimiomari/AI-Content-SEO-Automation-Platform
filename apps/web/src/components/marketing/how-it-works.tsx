'use client';

import { motion, type Variants } from 'framer-motion';
import {
  Bot,
  ChartColumn,
  ClipboardList,
  FolderKanban,
  Globe,
  PenLine,
  Repeat,
  Search,
  Send,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { SectionHeading } from './section-heading';

interface Step {
  title: string;
  description: string;
  icon: LucideIcon;
}

const STEPS: Step[] = [
  { title: 'Register', description: 'Create your workspace and invite the team.', icon: UserPlus },
  { title: 'Website', description: 'Connect your site; we learn your brand voice.', icon: Globe },
  {
    title: 'Project',
    description: 'Set goals, audience, competitors and locales.',
    icon: FolderKanban,
  },
  {
    title: 'Keywords',
    description: 'Agents discover, score and cluster opportunities.',
    icon: Search,
  },
  {
    title: 'Brief',
    description: 'A strategy-backed outline with intent and entities.',
    icon: ClipboardList,
  },
  {
    title: 'Article',
    description: 'Long-form drafts with citations and internal links.',
    icon: Bot,
  },
  {
    title: 'Edit',
    description: 'Rewrite, expand or optimise inline with AI actions.',
    icon: PenLine,
  },
  {
    title: 'Repurpose',
    description: 'Social posts, newsletters and short-video scripts.',
    icon: Repeat,
  },
  { title: 'Publish', description: 'Schedule to WordPress and social channels.', icon: Send },
  {
    title: 'Analytics',
    description: 'Rankings, clicks and content ROI in one view.',
    icon: ChartColumn,
  },
];

const list: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const card: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 border-t bg-muted/30 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="How it works"
          title="One journey, ten steps, zero busywork"
          description="Every module hands off to the next. Register once and follow the strip from first keyword to measurable traffic."
        />

        <div className="relative mt-14">
          <div
            aria-hidden="true"
            className="absolute inset-x-8 top-1/2 hidden h-px bg-linear-to-r from-transparent via-primary/40 to-transparent lg:block"
          />
          <motion.ol
            variants={list}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-80px' }}
            className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
          >
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <motion.li
                  key={step.title}
                  variants={card}
                  className="group relative rounded-xl border bg-card p-5 transition-[box-shadow,border-color] hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="flex items-center justify-between">
                    <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                  </div>
                  <h3 className="mt-4 font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                </motion.li>
              );
            })}
          </motion.ol>
        </div>
      </div>
    </section>
  );
}
