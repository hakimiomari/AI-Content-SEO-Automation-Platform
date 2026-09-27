import { ForbiddenException } from '@nestjs/common';
import type { RequestUser } from '../types/request-user';

/**
 * Resolves the tenant a request acts on.
 * - SUPER_ADMIN may target any company via `requestedCompanyId` (required for tenant-owned data).
 * - Everyone else is pinned to their own company; asking for another one is a 403.
 */
export function resolveCompanyId(user: RequestUser, requestedCompanyId?: string | null): string {
  if (user.role === 'SUPER_ADMIN') {
    const target = requestedCompanyId ?? user.companyId;
    if (!target) {
      throw new ForbiddenException('companyId is required for platform administrators');
    }
    return target;
  }
  if (!user.companyId) {
    throw new ForbiddenException('User is not attached to a company');
  }
  if (requestedCompanyId && requestedCompanyId !== user.companyId) {
    throw new ForbiddenException('Cannot access another company');
  }
  return user.companyId;
}

/** Like `resolveCompanyId` but lets SUPER_ADMIN omit the tenant (returns `undefined` = all). */
export function resolveOptionalCompanyId(
  user: RequestUser,
  requestedCompanyId?: string | null,
): string | undefined {
  if (user.role === 'SUPER_ADMIN') return requestedCompanyId ?? undefined;
  return resolveCompanyId(user, requestedCompanyId);
}
