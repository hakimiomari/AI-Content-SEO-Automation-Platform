import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Prisma } from '@acsp/database';
import type { Paginated } from '@acsp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { paginate, toOrderBy, toPageArgs } from '../../common/utils/pagination';
import { resolveCompanyId } from '../../common/utils/tenant';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditQueryDto } from './dto/audit-query.dto';

const AUDIT_SORT_FIELDS = ['createdAt', 'action', 'entity'] as const;

export type AuditLogRow = Prisma.AuditLogGetPayload<{
  include: { user: { select: { id: true; name: true; email: true } } };
}>;

@ApiTags('audit')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles('COMPANY_ADMIN')
  @ApiOperation({ summary: 'List audit log entries for the current company' })
  @ApiOkResponse({ description: 'Paginated audit entries' })
  async list(
    @CurrentUser() user: RequestUser,
    @Query() query: AuditQueryDto,
  ): Promise<Paginated<AuditLogRow>> {
    const companyId = resolveCompanyId(user, query.companyId);
    const where: Prisma.AuditLogWhereInput = {
      companyId,
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.action ? { action: query.action } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        ...toPageArgs(query),
        orderBy: toOrderBy(query, AUDIT_SORT_FIELDS, 'createdAt'),
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return paginate(data, total, query);
  }
}
