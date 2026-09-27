import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { COOKIE_NAMES } from '@acsp/shared';
import type { AuthTokens, JwtPayload } from '@acsp/shared';
import { AppConfig } from '../../config/configuration';
import type { RequestUser } from '../../common/types/request-user';

export interface IssuedTokens extends AuthTokens {
  /** Refresh token id (also embedded in the JWT as `jti`). */
  refreshJti: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  async signAccessToken(user: RequestUser): Promise<string> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      type: 'access',
    };
    return this.jwt.signAsync(payload, {
      secret: this.config.jwt.accessSecret,
      expiresIn: this.config.jwt.accessTtlSeconds,
    });
  }

  async signRefreshToken(
    user: RequestUser,
  ): Promise<{ token: string; jti: string; expiresAt: Date }> {
    const jti = randomUUID();
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      companyId: user.companyId,
      type: 'refresh',
      jti,
    };
    const ttl = this.config.jwt.refreshTtlSeconds;
    const token = await this.jwt.signAsync(payload, {
      secret: this.config.jwt.refreshSecret,
      expiresIn: ttl,
    });
    return { token, jti, expiresAt: new Date(Date.now() + ttl * 1_000) };
  }

  async issueTokens(user: RequestUser): Promise<IssuedTokens> {
    const [accessToken, refresh] = await Promise.all([
      this.signAccessToken(user),
      this.signRefreshToken(user),
    ]);
    return {
      accessToken,
      refreshToken: refresh.token,
      expiresIn: this.config.jwt.accessTtlSeconds,
      refreshJti: refresh.jti,
      refreshExpiresAt: refresh.expiresAt,
    };
  }

  async verifyRefreshToken(token: string): Promise<JwtPayload> {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.config.jwt.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh' || !payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return payload;
  }

  private cookieOptions(maxAgeSeconds?: number): CookieOptions {
    const { domain, secure } = this.config.cookies;
    return {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      domain,
      path: '/',
      ...(maxAgeSeconds !== undefined ? { maxAge: maxAgeSeconds * 1_000 } : {}),
    };
  }

  setAuthCookies(res: Response, tokens: AuthTokens): void {
    res.cookie(
      COOKIE_NAMES.ACCESS,
      tokens.accessToken,
      this.cookieOptions(this.config.jwt.accessTtlSeconds),
    );
    res.cookie(
      COOKIE_NAMES.REFRESH,
      tokens.refreshToken,
      this.cookieOptions(this.config.jwt.refreshTtlSeconds),
    );
  }

  clearAuthCookies(res: Response): void {
    res.clearCookie(COOKIE_NAMES.ACCESS, this.cookieOptions());
    res.clearCookie(COOKIE_NAMES.REFRESH, this.cookieOptions());
  }
}
