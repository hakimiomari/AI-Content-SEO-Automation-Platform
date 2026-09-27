import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '@acsp/database';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { RequestUser } from '../types/request-user';

/**
 * Passes when the user's role is one of the listed roles, or the user is SUPER_ADMIN.
 * Routes without `@Roles()` are open to every authenticated user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = request.user;
    if (!user) return false; // JwtAuthGuard already rejected; defensive only.

    if (user.role === 'SUPER_ADMIN' || required.includes(user.role)) return true;
    throw new ForbiddenException('Insufficient permissions');
  }
}
