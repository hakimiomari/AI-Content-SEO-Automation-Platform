import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { RequestUser } from '../types/request-user';

/**
 * Injects the authenticated principal (or one of its properties).
 * `@CurrentUser() user: RequestUser` or `@CurrentUser('companyId') companyId: string | null`.
 */
export const CurrentUser = createParamDecorator(
  (property: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: RequestUser }>();
    const user = request.user;
    if (!user) return undefined;
    return property ? user[property] : user;
  },
);
