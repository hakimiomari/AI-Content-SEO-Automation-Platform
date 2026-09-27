'use client';

import { motion, type Variants } from 'framer-motion';
import {
  Bot,
  CalendarCheck,
  CreditCard,
  Gauge,
  PenLine,
  Repeat,
  Search,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { SectionHeading } from './section-heading';

interface Feature {
  title: string;
  description: string;
  icon: LucideIcon;
}

const FEATURES: Feature[] = [
  {
    title: 'Keyword research',
    description: 'Discover, score and cluster keywords by intent, difficulty and business value.',
    icon: Search,
  },
  {
    title: 'AI agents',
    description:
      'Specialised agents for strategy, briefs, drafting and quality checks — with usage tracked per tenant.',
    icon: Bot,
  },
  {
    title: 'Content editor',
    description: 'Rewrite, expand, shorten, translate or add CTAs inline, with version history.',
    icon: PenLine,
  },
  {
    title: 'SEO analyzer',
    description: 'Real-time scoring on structure, entities, readability, links and metadata.',
    icon: Gauge,
  },
  {
    title: 'Repurposing',
    description:
      'One article becomes LinkedIn posts, X threads, newsletters and short-video scripts.',
    icon: Repeat,
  },
  {
    title: 'Calendar & publishing',
    description: 'Plan the month, then publish to WordPress, Shopify, Webflow and social channels.',
    icon: CalendarCheck,
  },
  {
    title: 'Analytics',
    description: 'Search Console data joined to your content so you see what actually ranks.',
    icon: TrendingUp,
  },
  {
    title: 'Billing',
    description:
      'Plans, seats and AI credits with clear limits — and white-label reports for agencies.',
    icon: CreditCard,
  },
];

const grid: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const cell: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
};

export function Features() {
  return (
    <section id="features" className="scroll-mt-24 py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Features"
          title="Everything a content team does, wired together"
          description="Eight modules that share one data model — keywords know their briefs, briefs know their articles, articles know their rankings."
        />

        <motion.ul
          variants={grid}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-80px' }}
          className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <motion.li
                key={feature.title}
                variants={cell}
                className="group relative overflow-hidden rounded-2xl border bg-card p-6 transition-[box-shadow,border-color] hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
              >
                <div
                  aria-hidden="true"
                  className="absolute -top-16 -right-16 size-40 rounded-full bg-brand-gradient opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-20"
                />
                <span className="relative grid size-11 place-items-center rounded-xl bg-brand-gradient text-white shadow-md shadow-primary/25">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="relative mt-5 font-semibold">{feature.title}</h3>
                <p className="relative mt-2 text-sm text-muted-foreground">{feature.description}</p>
              </motion.li>
            );
          })}
        </motion.ul>
      </div>
    </section>
  );
}
