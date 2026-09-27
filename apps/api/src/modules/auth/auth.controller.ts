import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { COOKIE_NAMES } from '@acsp/shared';
import type { AuthResponse, AuthUser } from '@acsp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { getRequestMeta } from '../../common/utils/request';
import { AuthService } from './auth.service';
import { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { TokenService } from './token.service';

type RequestWithCookies = Request & { cookies?: Record<string, string | undefined> };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a company and its first admin user' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({ description: 'Email already registered' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.register(dto, getRequestMeta(req));
    this.tokens.setAuthCookies(res, result.tokens);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.login(dto, getRequestMeta(req));
    this.tokens.setAuthCookies(res, result.tokens);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate the refresh token and issue a new access token' })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiUnauthorizedResponse({ description: 'Refresh token missing, revoked or expired' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: RequestWithCookies,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const raw = req.cookies?.[COOKIE_NAMES.REFRESH] ?? dto.refreshToken;
    try {
      const result = await this.auth.refresh(raw, getRequestMeta(req));
      this.tokens.setAuthCookies(res, result.tokens);
      return result;
    } catch (err) {
      this.tokens.clearAuthCookies(res);
      throw err;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke the presented refresh token and clear cookies',
    description: 'Public so it works even after the access token expired.',
  })
  @ApiNoContentResponse()
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: RequestWithCookies,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const raw = req.cookies?.[COOKIE_NAMES.REFRESH] ?? dto.refreshToken;
    await this.auth.logout(raw, getRequestMeta(req));
    this.tokens.clearAuthCookies(res);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Revoke every refresh token of the current user' })
  @ApiOkResponse({ schema: { properties: { revoked: { type: 'number' } } } })
  async logoutAll(
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ revoked: number }> {
    const result = await this.auth.logoutAll(user, getRequestMeta(req));
    this.tokens.clearAuthCookies(res);
    return result;
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Current user with company and subscription' })
  @ApiOkResponse({ type: AuthUserDto })
  me(@CurrentUser('id') userId: string): Promise<AuthUser> {
    return this.auth.me(userId);
  }

  @Patch('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Change password (revokes all refresh tokens)' })
  @ApiNoContentResponse()
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.changePassword(user, dto, getRequestMeta(req));
    this.tokens.clearAuthCookies(res);
  }
}
