import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@acsp/database';
import { PLAN_LIMITS } from '@acsp/shared';
import type { AuthResponse, Paginated } from '@acsp/shared';
import type { RequestUser } from '../../common/types/request-user';
import { randomToken } from '../../common/utils/crypto';
import { paginate, toOrderBy, toPageArgs } from '../../common/utils/pagination';
import type { RequestMeta } from '../../common/utils/request';
import { resolveCompanyId, resolveOptionalCompanyId } from '../../common/utils/tenant';
import { AppConfig } from '../../config/configuration';
import { isUniqueConstraintError, rethrowPrismaError } from '../../prisma/prisma-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService, BCRYPT_ROUNDS } from '../auth/auth.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InvitationsQueryDto, UsersQueryDto } from './dto/users-query.dto';
import { authUserSelect, publicUserSelect, type PublicUser } from './users.select';

const USER_SORT_FIELDS = ['createdAt', 'name', 'email', 'role', 'lastLoginAt'] as const;
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

export const invitationSelect = {
  id: true,
  email: true,
  role: true,
  expiresAt: true,
  acceptedAt: true,
  createdAt: true,
  companyId: true,
  invitedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.InvitationSelect;

export type InvitationRow = Prisma.InvitationGetPayload<{ select: typeof invitationSelect }>;

export interface InvitationCreated extends InvitationRow {
  /** Plain token — shown once so the admin can share the link until email delivery ships. */
  token: string;
  acceptUrl: string;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  // ─────────────────────────── list / read ───────────────────────────

  async list(actor: RequestUser, query: UsersQueryDto): Promise<Paginated<PublicUser>> {
    const companyId = resolveOptionalCompanyId(actor, query.companyId);
    const where: Prisma.UserWhereInput = {
      ...(companyId ? { companyId } : {}),
      ...(query.role ? { role: query.role } : {}),
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: publicUserSelect,
        ...toPageArgs(query),
        orderBy: toOrderBy(query, USER_SORT_FIELDS, 'createdAt'),
      }),
      this.prisma.user.count({ where }),
    ]);
    return paginate(data, total, query);
  }

  async findOne(actor: RequestUser, id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findFirst({
      where: { id, ...this.tenantScope(actor) },
      select: publicUserSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // ─────────────────────────── update / deactivate ───────────────────────────

  async update(
    actor: RequestUser,
    id: string,
    dto: UpdateUserDto,
    meta: RequestMeta,
  ): Promise<PublicUser> {
    const target = await this.findOne(actor, id);

    if (target.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Cannot modify a platform administrator');
    }
    if (id === actor.id && (dto.role !== undefined || dto.isActive === false)) {
      throw new BadRequestException('You cannot change your own role or deactivate yourself');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      select: publicUserSelect,
    });

    if (dto.isActive === false || (dto.role !== undefined && dto.role !== target.role)) {
      await this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    await this.audit.log({
      action: 'UPDATE',
      entity: 'User',
      entityId: id,
      before: target,
      after: updated,
      userId: actor.id,
      companyId: target.companyId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return updated;
  }

  async deactivate(actor: RequestUser, id: string, meta: RequestMeta): Promise<void> {
    if (id === actor.id) {
      throw new BadRequestException('You cannot deactivate yourself');
    }
    const target = await this.findOne(actor, id);
    if (target.role === 'SUPER_ADMIN' && actor.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Cannot deactivate a platform administrator');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { isActive: false }, select: { id: true } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.log({
      action: 'DELETE',
      entity: 'User',
      entityId: id,
      before: target,
      after: { isActive: false },
      userId: actor.id,
      companyId: target.companyId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  // ─────────────────────────── invitations ───────────────────────────

  async invite(
    actor: RequestUser,
    dto: InviteUserDto,
    meta: RequestMeta,
  ): Promise<InvitationCreated> {
    const companyId = resolveCompanyId(actor, dto.companyId);

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        subscription: { select: { plan: true } },
        _count: { select: { users: { where: { isActive: true } } } },
      },
    });
    if (!company) throw new NotFoundException('Company not found');

    const plan = company.subscription?.plan ?? 'FREE';
    const limit = PLAN_LIMITS[plan].users;
    const pendingInvites = await this.prisma.invitation.count({
      where: {
        companyId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
        NOT: { email: dto.email },
      },
    });
    if (company._count.users + pendingInvites >= limit) {
      throw new ForbiddenException(
        `The ${PLAN_LIMITS[plan].name} plan allows up to ${limit} user${limit === 1 ? '' : 's'}. Upgrade to invite more.`,
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, companyId: true },
    });
    if (existingUser) {
      throw new ConflictException(
        existingUser.companyId === companyId
          ? 'This user is already a member of your company'
          : 'A user with this email already exists',
      );
    }

    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);

    let invitation: InvitationRow;
    try {
      invitation = await this.prisma.invitation.upsert({
        where: { companyId_email: { companyId, email: dto.email } },
        create: {
          email: dto.email,
          role: dto.role,
          token,
          expiresAt,
          companyId,
          invitedById: actor.id,
        },
        update: { role: dto.role, token, expiresAt, acceptedAt: null, invitedById: actor.id },
        select: invitationSelect,
      });
    } catch (err: unknown) {
      rethrowPrismaError(err, 'Invitation');
    }

    await this.audit.log({
      action: 'INVITE',
      entity: 'Invitation',
      entityId: invitation.id,
      after: { email: dto.email, role: dto.role, expiresAt },
      userId: actor.id,
      companyId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      ...invitation,
      token,
      acceptUrl: `${this.config.webUrl.replace(/\/+$/, '')}/accept-invite?token=${token}`,
    };
  }

  async acceptInvite(dto: AcceptInviteDto, meta: RequestMeta): Promise<AuthResponse> {
    const invitation = await this.prisma.invitation.findUnique({ where: { token: dto.token } });
    if (!invitation || invitation.acceptedAt || invitation.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Invitation is invalid or has expired');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: invitation.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: invitation.email,
            name: dto.name,
            passwordHash,
            role: invitation.role,
            companyId: invitation.companyId,
            emailVerified: new Date(),
          },
          select: authUserSelect,
        });
        await tx.invitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });
        return created;
      });

      await this.audit.log({
        action: 'CREATE',
        entity: 'User',
        entityId: user.id,
        after: { email: user.email, role: user.role, viaInvitation: invitation.id },
        userId: user.id,
        companyId: invitation.companyId,
        ip: meta.ip,
        userAgent: meta.userAgent,
      });

      return this.auth.issueSession(user, meta);
    } catch (err: unknown) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictException('A user with this email already exists');
      }
      throw err;
    }
  }

  async listInvitations(
    actor: RequestUser,
    query: InvitationsQueryDto,
  ): Promise<Paginated<InvitationRow>> {
    const companyId = resolveCompanyId(actor, query.companyId);
    const where: Prisma.InvitationWhereInput = {
      companyId,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
      ...(query.search ? { email: { contains: query.search, mode: 'insensitive' } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.invitation.findMany({
        where,
        select: invitationSelect,
        ...toPageArgs(query),
        orderBy: toOrderBy(query, ['createdAt', 'email', 'expiresAt'] as const, 'createdAt'),
      }),
      this.prisma.invitation.count({ where }),
    ]);
    return paginate(data, total, query);
  }

  async revokeInvitation(actor: RequestUser, id: string, meta: RequestMeta): Promise<void> {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id },
      select: invitationSelect,
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    // Ensures non-super-admins can only touch their own tenant.
    resolveCompanyId(actor, invitation.companyId);

    await this.prisma.invitation.delete({ where: { id } });
    await this.audit.log({
      action: 'DELETE',
      entity: 'Invitation',
      entityId: id,
      before: invitation,
      userId: actor.id,
      companyId: invitation.companyId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  // ─────────────────────────── helpers ───────────────────────────

  private tenantScope(actor: RequestUser): Prisma.UserWhereInput {
    if (actor.role === 'SUPER_ADMIN') return {};
    return { companyId: resolveCompanyId(actor) };
  }
}
