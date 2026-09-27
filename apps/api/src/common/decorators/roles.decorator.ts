import { SetMetadata } from '@nestjs/common';
import type { Role } from '@acsp/database';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the listed roles. `SUPER_ADMIN` always passes.
 * Example: `@Roles('COMPANY_ADMIN')`.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
