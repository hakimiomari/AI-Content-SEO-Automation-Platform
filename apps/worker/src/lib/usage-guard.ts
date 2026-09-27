import { Plan, type Subscription } from '@acsp/database';
import { PLAN_LIMITS } from '@acsp/shared';
import { UnrecoverableError } from 'bullmq';
import { prisma } from './prisma';

export type UsageKind = 'words' | 'aiCredits';

export interface UsageDelta {
  words?: number;
  aiCredits?: number;
}

/**
 * Raised when a job would push the tenant over its plan quota. Extends BullMQ's
 * UnrecoverableError so the job fails immediately instead of retrying — retrying cannot help.
 */
export class PlanLimitExceededError extends UnrecoverableError {
  constructor(
    public readonly kind: UsageKind,
    public readonly plan: Plan,
    public readonly used: number,
    public readonly requested: number,
    public readonly limit: number,
  ) {
    super(
      `Plan limit exceeded (${PLAN_LIMITS[plan].name}): ${kind} used ${used} + requested ${requested} > ${limit} per month. Upgrade the plan or wait for the next billing period.`,
    );
    this.name = 'PlanLimitExceededError';
  }
}

/** Ensures a Subscription row exists (FREE by default) and returns it. */
export async function getSubscription(companyId: string): Promise<Subscription> {
  const existing = await prisma.subscription.findUnique({ where: { companyId } });
  if (existing) return existing;
  return prisma.subscription.upsert({
    where: { companyId },
    update: {},
    create: { companyId, plan: Plan.FREE },
  });
}

export function getPlanLimits(plan: Plan) {
  return PLAN_LIMITS[plan];
}

/**
 * Throws PlanLimitExceededError if `delta` would exceed the monthly quota of the company's plan.
 * Words and AI credits are checked independently.
 */
export async function assertWithinLimits(
  companyId: string,
  delta: UsageDelta,
): Promise<Subscription> {
  const subscription = await getSubscription(companyId);
  const limits = PLAN_LIMITS[subscription.plan];

  if (delta.words && delta.words > 0) {
    const projected = subscription.wordsUsed + delta.words;
    if (projected > limits.wordsPerMonth) {
      throw new PlanLimitExceededError(
        'words',
        subscription.plan,
        subscription.wordsUsed,
        delta.words,
        limits.wordsPerMonth,
      );
    }
  }
  if (delta.aiCredits && delta.aiCredits > 0) {
    const projected = subscription.aiCreditsUsed + delta.aiCredits;
    if (projected > limits.aiCreditsPerMonth) {
      throw new PlanLimitExceededError(
        'aiCredits',
        subscription.plan,
        subscription.aiCreditsUsed,
        delta.aiCredits,
        limits.aiCreditsPerMonth,
      );
    }
  }
  return subscription;
}

/** Increments the subscription usage counters. Creates the FREE subscription if missing. */
export async function recordUsage(companyId: string, delta: UsageDelta): Promise<void> {
  const words = Math.max(0, Math.round(delta.words ?? 0));
  const aiCredits = Math.max(0, Math.round(delta.aiCredits ?? 0));
  if (words === 0 && aiCredits === 0) return;
  await prisma.subscription.upsert({
    where: { companyId },
    update: {
      ...(words ? { wordsUsed: { increment: words } } : {}),
      ...(aiCredits ? { aiCreditsUsed: { increment: aiCredits } } : {}),
    },
    create: { companyId, plan: Plan.FREE, wordsUsed: words, aiCreditsUsed: aiCredits },
  });
}
