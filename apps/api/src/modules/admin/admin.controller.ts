import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { AdminService, AdminStats } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@ApiCookieAuth()
@Roles('SUPER_ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: '[SUPER_ADMIN] Platform-wide counters, AI usage and queue health' })
  @ApiOkResponse({ description: 'Dashboard statistics' })
  getStats(): Promise<AdminStats> {
    return this.admin.getStats();
  }
}
