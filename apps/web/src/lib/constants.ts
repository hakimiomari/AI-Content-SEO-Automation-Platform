import type { Role } from '@acsp/shared';
import {
  CalendarDays,
  ChartColumn,
  FileChartColumn,
  FileText,
  FolderKanban,
  Globe,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? 'AI Content & SEO Platform';
export const APP_TAGLINE = 'From keyword to published post — on autopilot.';

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  description: string;
  /** When set, only these roles see the item. */
  roles?: readonly Role[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    description: 'Overview of usage, activity and next steps.',
  },
  {
    title: 'Projects',
    href: '/projects',
    icon: FolderKanban,
    description: 'Keyword clusters, strategies and briefs per campaign.',
  },
  {
    title: 'Websites',
    href: '/websites',
    icon: Globe,
    description: 'Connected sites, brand voice and audience profiles.',
  },
  {
    title: 'Content',
    href: '/content',
    icon: FileText,
    description: 'Drafts, reviews and published articles.',
  },
  {
    title: 'Calendar',
    href: '/calendar',
    icon: CalendarDays,
    description: 'Schedule and publish across channels.',
  },
  {
    title: 'Analytics',
    href: '/analytics',
    icon: ChartColumn,
    description: 'Rankings, traffic and content performance.',
  },
  {
    title: 'Reports',
    href: '/reports',
    icon: FileChartColumn,
    description: 'Shareable SEO and content reports.',
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: Settings,
    description: 'Profile, company, team, integrations and billing.',
  },
  {
    title: 'Admin',
    href: '/admin',
    icon: ShieldCheck,
    description: 'Platform-wide tenant and usage management.',
    roles: ['SUPER_ADMIN'],
  },
];

export const MARKETING_LINKS = [
  { label: 'Features', href: '/#features' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Pricing', href: '/#pricing' },
] as const;

export const SIDEBAR_STORAGE_KEY = 'acsp:sidebar-collapsed';

/** Roadmap phases referenced by placeholder pages. */
export const ROADMAP = {
  websitesProjects: 'Phase 2 · Websites, projects & keyword research',
  contentGeneration: 'Phase 3 · AI briefs & article generation',
  editor: 'Phase 4 · Content editor & SEO analyzer',
  publishing: 'Phase 5 · Repurposing, calendar & publishing',
  analytics: 'Phase 6 · Analytics & reports',
  billingAdmin: 'Phase 7 · Billing, team & platform admin',
} as const;
