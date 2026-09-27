import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { AuthResponse, Paginated } from '@acsp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { getRequestMeta } from '../../common/utils/request';
import { AuthResponseDto } from '../auth/dto/auth-response.dto';
import { TokenService } from '../auth/token.service';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InvitationsQueryDto, UsersQueryDto } from './dto/users-query.dto';
import { InvitationCreated, InvitationRow, UsersService } from './users.service';
import type { PublicUser } from './users.select';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly tokens: TokenService,
  ) {}

  // ───────── invitations (static paths first so they never collide with /:id) ─────────

  @Get('invitations')
  @Roles('COMPANY_ADMIN')
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'List pending invitations for the company' })
  @ApiOkResponse({ description: 'Paginated invitations (tokens are not included)' })
  listInvitations(
    @CurrentUser() user: RequestUser,
    @Query() query: InvitationsQueryDto,
  ): Promise<Paginated<InvitationRow>> {
    return this.users.listInvitations(user, query);
  }

  @Delete('invitations/:id')
  @Roles('COMPANY_ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  @ApiParam({ name: 'id' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  async revokeInvitation(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.users.revokeInvitation(user, id, getRequestMeta(req));
  }

  @Post('invite')
  @Roles('COMPANY_ADMIN')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Invite a user to the company',
    description:
      'Creates (or refreshes) an invitation valid for 7 days. Enforces the plan user limit. ' +
      'The plain token is returned once so the link can be shared until email delivery ships.',
  })
  @ApiCreatedResponse({ description: 'Invitation with one-time token and accept URL' })
  @ApiConflictResponse({ description: 'User already exists' })
  @ApiForbiddenResponse({ description: 'Plan user limit reached' })
  invite(
    @CurrentUser() user: RequestUser,
    @Body() dto: InviteUserDto,
    @Req() req: Request,
  ): Promise<InvitationCreated> {
    return this.users.invite(user, dto, getRequestMeta(req));
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('accept-invite')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Accept an invitation: creates the user and logs them in' })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiConflictResponse({ description: 'User already exists' })
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.users.acceptInvite(dto, getRequestMeta(req));
    this.tokens.setAuthCookies(res, result.tokens);
    return result;
  }

  // ───────── users ─────────

  @Get()
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'List users of the company (SUPER_ADMIN may filter by companyId)' })
  @ApiOkResponse({ description: 'Paginated users' })
  list(
    @CurrentUser() user: RequestUser,
    @Query() query: UsersQueryDto,
  ): Promise<Paginated<PublicUser>> {
    return this.users.list(user, query);
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get a user of the company' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'User' })
  @ApiNotFoundResponse()
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string): Promise<PublicUser> {
    return this.users.findOne(user, id);
  }

  @Patch(':id')
  @Roles('COMPANY_ADMIN')
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Update a user (name, avatar, role, active flag)' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Updated user' })
  @ApiForbiddenResponse({ description: 'Cannot modify users outside your company' })
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @Req() req: Request,
  ): Promise<PublicUser> {
    return this.users.update(user, id, dto, getRequestMeta(req));
  }

  @Delete(':id')
  @Roles('COMPANY_ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Deactivate a user (soft delete) and revoke their sessions' })
  @ApiParam({ name: 'id' })
  @ApiNoContentResponse()
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.users.deactivate(user, id, getRequestMeta(req));
  }
}
