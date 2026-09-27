import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthUserRow } from '../users/users.select';
import { AuthService } from './auth.service';
import { TokenService } from './token.service';

const appConfigStub = {
  jwt: {
    accessSecret: 'a'.repeat(32),
    refreshSecret: 'r'.repeat(32),
    accessTtl: '15m',
    refreshTtl: '7d',
    accessTtlSeconds: 900,
    refreshTtlSeconds: 604_800,
  },
  cookies: { domain: undefined, secure: false },
};

const meta = { ip: '127.0.0.1', userAgent: 'jest' };

const userRow: AuthUserRow = {
  id: 'user_1',
  email: 'jane@acme.com',
  name: 'Jane Doe',
  role: 'COMPANY_ADMIN',
  avatarUrl: null,
  companyId: 'company_1',
  isActive: true,
  company: {
    id: 'company_1',
    name: 'Acme Inc',
    slug: 'acme-inc',
    subscription: { plan: 'FREE', status: 'ACTIVE' },
  },
};

function createPrismaMock() {
  const tx = {
    company: { create: jest.fn() },
    user: { create: jest.fn() },
    refreshToken: { update: jest.fn(), create: jest.fn() },
  };
  return {
    tx,
    user: { findUnique: jest.fn(), update: jest.fn() },
    company: { findUnique: jest.fn() },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: ReturnType<typeof createPrismaMock>;
  let jwt: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = createPrismaMock();
    jwt = {
      signAsync: jest.fn(
        async (payload: { type: string; jti?: string }) =>
          `${payload.type}.token.${payload.jti ?? 'none'}`,
      ),
      verifyAsync: jest.fn(),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        TokenService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: AppConfig, useValue: appConfigStub },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  describe('register', () => {
    const dto = {
      name: 'Jane Doe',
      email: 'jane@acme.com',
      password: 'Password123',
      companyName: 'Acme Inc',
    };

    it('creates a company with a FREE subscription and a COMPANY_ADMIN user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.company.findUnique.mockResolvedValue(null);
      prisma.tx.company.create.mockResolvedValue({ id: 'company_1' });
      prisma.tx.user.create.mockResolvedValue(userRow);
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt_1' });

      const result = await service.register(dto, meta);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.tx.company.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Acme Inc',
            slug: 'acme-inc',
            subscription: { create: { plan: 'FREE', status: 'ACTIVE' } },
          }),
        }),
      );

      const userArgs = prisma.tx.user.create.mock.calls[0][0] as {
        data: { role: string; companyId: string; passwordHash: string; email: string };
      };
      expect(userArgs.data.role).toBe('COMPANY_ADMIN');
      expect(userArgs.data.companyId).toBe('company_1');
      expect(userArgs.data.passwordHash).not.toBe(dto.password);
      expect(await bcrypt.compare(dto.password, userArgs.data.passwordHash)).toBe(true);

      expect(result.user).toMatchObject({
        id: 'user_1',
        email: 'jane@acme.com',
        role: 'COMPANY_ADMIN',
        company: { slug: 'acme-inc', plan: 'FREE', subscriptionStatus: 'ACTIVE' },
      });
      expect(result.tokens.accessToken).toMatch(/^access\.token/);
      expect(result.tokens.refreshToken).toMatch(/^refresh\.token/);
      expect(result.tokens.expiresIn).toBe(900);
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN' }));
    });

    it('de-duplicates the company slug when it is taken', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.company.findUnique.mockResolvedValueOnce({ id: 'other' }).mockResolvedValue(null);
      prisma.tx.company.create.mockResolvedValue({ id: 'company_1' });
      prisma.tx.user.create.mockResolvedValue(userRow);
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt_1' });

      await service.register(dto, meta);

      const companyArgs = prisma.tx.company.create.mock.calls[0][0] as { data: { slug: string } };
      expect(companyArgs.data.slug).toMatch(/^acme-inc-[a-z0-9]{5}$/);
    });

    it('rejects an already registered email with 409', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.register(dto, meta)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('rejects a wrong password with a generic message', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...userRow,
        passwordHash: await bcrypt.hash('Correct123', 4),
      });

      await expect(
        service.login({ email: 'jane@acme.com', password: 'Wrong123' }, meta),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown email with the same generic message', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nobody@acme.com', password: 'Whatever1' }, meta),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });

    it('rejects inactive users even with the right password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...userRow,
        isActive: false,
        passwordHash: await bcrypt.hash('Correct123', 4),
      });

      await expect(
        service.login({ email: 'jane@acme.com', password: 'Correct123' }, meta),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('updates lastLoginAt and issues tokens on success', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...userRow,
        passwordHash: await bcrypt.hash('Correct123', 4),
      });
      prisma.user.update.mockResolvedValue({ id: 'user_1' });
      prisma.refreshToken.create.mockResolvedValue({ id: 'rt_1' });

      const result = await service.login({ email: 'jane@acme.com', password: 'Correct123' }, meta);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { lastLoginAt: expect.any(Date) } }),
      );
      expect(result.user.id).toBe('user_1');
      expect(result.tokens.refreshToken).toBeDefined();
    });
  });

  describe('refresh', () => {
    const payload = {
      sub: 'user_1',
      email: 'jane@acme.com',
      role: 'COMPANY_ADMIN',
      companyId: 'company_1',
      type: 'refresh',
      jti: 'jti_1',
    };

    it('rejects a revoked token and revokes every session for that user', async () => {
      jwt.verifyAsync.mockResolvedValue(payload);
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt_1',
        userId: 'user_1',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.refreshToken.updateMany.mockResolvedValue({ count: 2 });

      await expect(service.refresh('raw-token', meta)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user_1', revokedAt: null } }),
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an expired token', async () => {
      jwt.verifyAsync.mockResolvedValue(payload);
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt_1',
        userId: 'user_1',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1_000),
      });

      await expect(service.refresh('raw-token', meta)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a token whose signature does not verify', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('jwt malformed'));

      await expect(service.refresh('garbage', meta)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('rotates a valid token: revokes the old row and stores the new hash', async () => {
      jwt.verifyAsync.mockResolvedValue(payload);
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt_1',
        userId: 'user_1',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.findUnique.mockResolvedValue(userRow);
      prisma.tx.refreshToken.update.mockResolvedValue({});
      prisma.tx.refreshToken.create.mockResolvedValue({});

      const result = await service.refresh('raw-token', meta);

      expect(prisma.tx.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'rt_1' }, data: { revokedAt: expect.any(Date) } }),
      );
      expect(prisma.tx.refreshToken.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user_1', tokenHash: expect.any(String) }),
        }),
      );
      expect(result.tokens.accessToken).toMatch(/^access\.token/);
      expect(result.user.id).toBe('user_1');
    });
  });
});
