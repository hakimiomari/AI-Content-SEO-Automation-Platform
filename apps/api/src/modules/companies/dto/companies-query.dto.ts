import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Plan, SubscriptionStatus } from '@acsp/database';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class CompaniesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Plan })
  @IsOptional()
  @IsEnum(Plan)
  plan?: Plan;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;
}

export class CompanyScopeQueryDto {
  @ApiPropertyOptional({ description: 'SUPER_ADMIN only: act on another company' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  companyId?: string;
}
