import type { Plan } from '../enums';

export interface PlanLimits {
  name: string;
  priceUsdMonthly: number;
  users: number;
  websites: number;
  projects: number;
  keywordsPerMonth: number;
  wordsPerMonth: number;
  aiCreditsPerMonth: number;
  socialPostsPerMonth: number;
  integrations: number;
  features: string[];
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  FREE: {
    name: 'Free',
    priceUsdMonthly: 0,
    users: 1,
    websites: 1,
    projects: 1,
    keywordsPerMonth: 50,
    wordsPerMonth: 5_000,
    aiCreditsPerMonth: 50,
    socialPostsPerMonth: 10,
    integrations: 1,
    features: ['Keyword research', 'AI drafts', 'SEO analyzer'],
  },
  STARTER: {
    name: 'Starter',
    priceUsdMonthly: 29,
    users: 3,
    websites: 2,
    projects: 5,
    keywordsPerMonth: 500,
    wordsPerMonth: 50_000,
    aiCreditsPerMonth: 500,
    socialPostsPerMonth: 100,
    integrations: 3,
    features: ['Everything in Free', 'Repurposing', 'WordPress publishing', 'Calendar'],
  },
  GROWTH: {
    name: 'Growth',
    priceUsdMonthly: 79,
    users: 10,
    websites: 5,
    projects: 25,
    keywordsPerMonth: 2_500,
    wordsPerMonth: 250_000,
    aiCreditsPerMonth: 2_500,
    socialPostsPerMonth: 500,
    integrations: 10,
    features: ['Everything in Starter', 'Search Console analytics', 'Premium AI model', 'Reports'],
  },
  AGENCY: {
    name: 'Agency',
    priceUsdMonthly: 199,
    users: 50,
    websites: 50,
    projects: 200,
    keywordsPerMonth: 20_000,
    wordsPerMonth: 1_000_000,
    aiCreditsPerMonth: 15_000,
    socialPostsPerMonth: 5_000,
    integrations: 100,
    features: [
      'Everything in Growth',
      'White-label reports',
      'Priority queue',
      'Audit logs export',
    ],
  },
};

export const PLAN_ORDER: Plan[] = ['FREE', 'STARTER', 'GROWTH', 'AGENCY'];

export function isPlanAtLeast(current: Plan, required: Plan): boolean {
  return PLAN_ORDER.indexOf(current) >= PLAN_ORDER.indexOf(required);
}
