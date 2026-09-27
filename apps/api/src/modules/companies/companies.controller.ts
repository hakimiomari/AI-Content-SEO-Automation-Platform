import { Body, Controller, Get, Param, Patch, Query, Req } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import type { Paginated } from '@acsp/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import type { RequestUser } from '../../common/types/request-user';
import { getRequestMeta } from '../../common/utils/request';
import { CompaniesService, CompanyDetail, CompanyUsage } from './companies.service';
import { CompaniesQueryDto, CompanyScopeQueryDto } from './dto/companies-query.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';

@ApiTags('companies')
@ApiBearerAuth()
@ApiCookieAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  // ───────── /companies/me (declared before /:id so "me" is never treated as an id) ─────────

  @Get('me')
  @ApiOperation({ summary: 'Current company with subscription and counts' })
  @ApiOkResponse({ description: 'Company detail' })
  getMine(
    @CurrentUser() user: RequestUser,
    @Query() query: CompanyScopeQueryDto,
  ): Promise<CompanyDetail> {
    return this.companies.getMine(user, query.companyId);
  }

  @Patch('me')
  @Roles('COMPANY_ADMIN')
  @ApiOperation({ summary: 'Update current company profile' })
  @ApiOkResponse({ description: 'Updated company' })
  @ApiConflictResponse({ description: 'Slug already taken' })
  updateMine(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateCompanyDto,
    @Query() query: CompanyScopeQueryDto,
    @Req() req: Request,
  ): Promise<CompanyDetail> {
    return this.companies.updateMine(user, dto, getRequestMeta(req), query.companyId);
  }

  @Get('me/usage')
  @ApiOperation({ summary: 'Usage vs plan limits for the current billing period' })
  @ApiOkResponse({ description: 'Usage meters' })
  getUsage(
    @CurrentUser() user: RequestUser,
    @Query() query: CompanyScopeQueryDto,
  ): Promise<CompanyUsage> {
    return this.companies.getUsage(user, query.companyId);
  }

  // ───────── platform admin ─────────

  @Get()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: '[SUPER_ADMIN] List all companies' })
  @ApiOkResponse({ description: 'Paginated companies' })
  list(@Query() query: CompaniesQueryDto): Promise<Paginated<CompanyDetail>> {
    return this.companies.list(query);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: '[SUPER_ADMIN] Get a company by id' })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Company detail' })
  @ApiNotFoundResponse()
  findOne(@Param('id') id: string): Promise<CompanyDetail> {
    return this.companies.findById(id);
  }

  @Patch(':id/subscription')
  @Roles('SUPER_ADMIN')
  @ApiOperation({
    summary: '[SUPER_ADMIN] Manually change plan/status (Stripe arrives in Phase 7)',
  })
  @ApiParam({ name: 'id' })
  @ApiOkResponse({ description: 'Company with updated subscription' })
  updateSubscription(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionDto,
    @Req() req: Request,
  ): Promise<CompanyDetail> {
    return this.companies.updateSubscription(user, id, dto, getRequestMeta(req));
  }
}
