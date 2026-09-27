import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@acsp/database';
import type { AuthResponse, AuthUser } from '@acsp/shared';
import type { RequestMeta } from '../../common/utils/request';
import { sha256 } from '../../common/utils/crypto';
import { shortSuffix, slugify } from '../../common/utils/slug';
import { isUniqueConstraintError } from '../../prisma/prisma-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { authUserSelect, toAuthUser, type AuthUserRow } from '../users/users.select';
import type { RequestUser } from '../../common/types/request-user';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenService } from './token.service';

export const BCRYPT_ROUNDS = 12;
const INVALID_CREDENTIALS = 'Invalid credentials';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  // ─────────────────────────── register ───────────────────────────

  async register(dto: RegisterDto, meta: RequestMeta): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const slug = await this.uniqueSlug(dto.companyName);

    let user: AuthUserRow;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        const company = await tx.company.create({
          data: {
            name: dto.companyName,
            slug,
            subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
          },
          select: { id: true },
        });
        return tx.user.create({
          data: {
            name: dto.name,
            email: dto.email,
            passwordHash,
            role: 'COMPANY_ADMIN',
            companyId: company.id,
          },
          select: authUserSelect,
        });
      });
    } catch (err: unknown) {
      if (isUniqueConstraintError(err)) {
        throw new ConflictException('Email or company slug already in use');
      }
      throw err;
    }

    await this.audit.log({
      action: 'CREATE',
      entity: 'Company',
      entityId: user.companyId,
      after: { name: dto.companyName, slug },
      userId: user.id,
      companyId: user.companyId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return this.issueSession(user, meta);
  }

  private async uniqueSlug(companyName: string): Promise<string> {
    const base = slugify(companyName);
    let candidate = base;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const taken = await this.prisma.company.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!taken) return candidate;
      candidate = `${base.slice(0, 54)}-${shortSuffix()}`;
    }
    return `${base.slice(0, 48)}-${shortSuffix(10)}`;
  }

  // ─────────────────────────── login ───────────────────────────

  async login(dto: LoginDto, meta: RequestMeta): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { ...authUserSelect, passwordHash: true },
    });
    if (!user) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
      select: { id: true },
    });

    const { passwordHash: _hash, ...row } = user;
    return this.issueSession(row, meta);
  }

  // ─────────────────────────── refresh (rotation) ───────────────────────────

  async refresh(rawToken: string | undefined, meta: RequestMeta): Promise<AuthResponse> {
    if (!rawToken) {
      throw new UnauthorizedException('Refresh token missing');
    }
    const payload = await this.tokens.verifyRefreshToken(rawToken);
    const tokenHash = sha256(rawToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, revokedAt: true, expiresAt: true },
    });

    if (!stored || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Refresh token not recognised');
    }
    if (stored.revokedAt) {
      // Reuse of a rotated token => likely theft. Kill every session for this user.
      await this.revokeAllForUser(stored.userId);
      this.logger.warn(`Refresh token reuse detected for user ${stored.userId}`);
      throw new UnauthorizedException('Refresh token has been revoked');
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: stored.userId },
      select: authUserSelect,
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }

    const issued = await this.tokens.issueTokens(this.toPrincipal(user));
    await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
      await tx.refreshToken.create({
        data: {
          tokenHash: sha256(issued.refreshToken),
          userId: user.id,
          expiresAt: issued.refreshExpiresAt,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
        },
      });
    });

    return {
      user: toAuthUser(user),
      tokens: {
        accessToken: issued.accessToken,
        refreshToken: issued.refreshToken,
        expiresIn: issued.expiresIn,
      },
    };
  }

  // ─────────────────────────── logout ───────────────────────────

  /** Revokes the presented refresh token. Safe to call with an unknown/expired token. */
  async logout(rawToken: string | undefined, meta: RequestMeta): Promise<void> {
    if (!rawToken) return;
    const tokenHash = sha256(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, revokedAt: true, user: { select: { companyId: true } } },
    });
    if (!stored) return;
    if (!stored.revokedAt) {
      await this.prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit.log({
      action: 'LOGOUT',
      entity: 'User',
      entityId: stored.userId,
      userId: stored.userId,
      companyId: stored.user.companyId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  async logoutAll(user: RequestUser, meta: RequestMeta): Promise<{ revoked: number }> {
    const revoked = await this.revokeAllForUser(user.id);
    await this.audit.log({
      action: 'LOGOUT',
      entity: 'User',
      entityId: user.id,
      after: { revokedSessions: revoked },
      userId: user.id,
      companyId: user.companyId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { revoked };
  }

  private async revokeAllForUser(userId: string): Promise<number> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  // ─────────────────────────── me / password ───────────────────────────

  async me(userId: string): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: authUserSelect,
    });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account is inactive');
    }
    return toAuthUser(user);
  }

  async changePassword(
    user: RequestUser,
    dto: ChangePasswordDto,
    meta: RequestMeta,
  ): Promise<void> {
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, passwordHash: true },
    });
    if (!row) {
      throw new UnauthorizedException('Account not found');
    }
    const valid = await bcrypt.compare(dto.currentPassword, row.passwordHash);
    if (!valid) {
      throw new BadRequestException('Current password is incorrect');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('New password must differ from the current password');
    }
    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: row.id },
      data: { passwordHash },
      select: { id: true },
    });
    await this.revokeAllForUser(row.id);
    await this.audit.log({
      action: 'UPDATE',
      entity: 'User',
      entityId: row.id,
      after: { passwordChanged: true },
      userId: user.id,
      companyId: user.companyId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  }

  // ─────────────────────────── helpers ───────────────────────────

  private toPrincipal(user: Pick<AuthUserRow, 'id' | 'email' | 'role' | 'companyId'>): RequestUser {
    return { id: user.id, email: user.email, role: user.role, companyId: user.companyId };
  }

  /** Issues tokens, persists the hashed refresh token and writes a LOGIN audit row. */
  async issueSession(user: AuthUserRow, meta: RequestMeta): Promise<AuthResponse> {
    const issued = await this.tokens.issueTokens(this.toPrincipal(user));
    const data: Prisma.RefreshTokenUncheckedCreateInput = {
      tokenHash: sha256(issued.refreshToken),
      userId: user.id,
      expiresAt: issued.refreshExpiresAt,
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    };
    await this.prisma.refreshToken.create({ data });

    await this.audit.log({
      action: 'LOGIN',
      entity: 'User',
      entityId: user.id,
      userId: user.id,
      companyId: user.companyId,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });

    return {
      user: toAuthUser(user),
      tokens: {
        accessToken: issued.accessToken,
        refreshToken: issued.refreshToken,
        expiresIn: issued.expiresIn,
      },
    };
  }
}
