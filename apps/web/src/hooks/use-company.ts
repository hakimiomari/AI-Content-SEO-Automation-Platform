'use client';

import { useQuery } from '@tanstack/react-query';
import { PLAN_LIMITS, type Plan, type PlanLimits, type SubscriptionStatus } from '@acsp/shared';
import { api, ApiClientError } from '@/lib/api-client';

/** `GET /companies/me` */
export interface CompanyMe {
  id: string;
  name: string;
  slug: string;
  subscription?: {
    plan: Plan;
    status: SubscriptionStatus;
    currentPeriodEnd?: string | null;
    trialEndsAt?: string | null;
  } | null;
  _count?: {
    users: number;
    websites: number;
    projects: number;
    integrations: number;
  };
  createdAt?: string;
}

interface UsageMetric {
  used: number;
  limit: number;
  remaining: number;
  percent: number;
}

/** Raw `GET /companies/me/usage` response from the API. */
interface CompanyUsageResponse {
  companyId: string;
  plan: Plan;
  status: SubscriptionStatus;
  period: { start: string; end: string | null };
  usage: Record<
    'words' | 'aiCredits' | 'users' | 'websites' | 'projects' | 'integrations',
    UsageMetric
  >;
}

/** Usage shape consumed by the dashboard (normalised from the API response). */
export interface CompanyUsage {
  plan: Plan;
  limits: PlanLimits;
  used: {
    words: number;
    aiCredits: number;
    users: number;
    websites: number;
    projects: number;
  };
  periodEnd: string | null;
}

function toCompanyUsage(raw: CompanyUsageResponse): CompanyUsage {
  return {
    plan: raw.plan,
    limits: PLAN_LIMITS[raw.plan],
    used: {
      words: raw.usage.words.used,
      aiCredits: raw.usage.aiCredits.used,
      users: raw.usage.users.used,
      websites: raw.usage.websites.used,
      projects: raw.usage.projects.used,
    },
    periodEnd: raw.period.end,
  };
}

export const companyKeys = {
  me: ['company', 'me'] as const,
  usage: ['company', 'usage'] as const,
};

export function useCompany() {
  return useQuery<CompanyMe, ApiClientError>({
    queryKey: companyKeys.me,
    queryFn: () => api.get<CompanyMe>('/companies/me'),
    staleTime: 60 * 1000,
  });
}

export function useCompanyUsage() {
  return useQuery<CompanyUsage, ApiClientError>({
    queryKey: companyKeys.usage,
    queryFn: async () => toCompanyUsage(await api.get<CompanyUsageResponse>('/companies/me/usage')),
    staleTime: 30 * 1000,
  });
}
