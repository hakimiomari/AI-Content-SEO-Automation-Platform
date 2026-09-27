import { Prisma } from '@acsp/database';
import type { AuthUser } from '@acsp/shared';

/** Fields safe to expose to the owning company. Never includes `passwordHash`. */
export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  isActive: true,
  emailVerified: true,
  lastLoginAt: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

/** Shape returned by `/auth/*` — includes company + subscription plan/status. */
export const authUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  avatarUrl: true,
  companyId: true,
  isActive: true,
  company: {
    select: {
      id: true,
      name: true,
      slug: true,
      subscription: { select: { plan: true, status: true } },
    },
  },
} satisfies Prisma.UserSelect;

export type AuthUserRow = Prisma.UserGetPayload<{ select: typeof authUserSelect }>;

export function toAuthUser(row: AuthUserRow): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    avatarUrl: row.avatarUrl,
    companyId: row.companyId,
    company: row.company
      ? {
          id: row.company.id,
          name: row.company.name,
          slug: row.company.slug,
          plan: row.company.subscription?.plan ?? 'FREE',
          subscriptionStatus: row.company.subscription?.status ?? 'ACTIVE',
        }
      : null,
  };
}

/** Strips `passwordHash` (and anything else sensitive) from a full User row. */
export function toPublicUser<T extends { passwordHash?: string }>(
  user: T,
): Omit<T, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}
