import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsEnum, IsOptional } from 'class-validator';
import { Plan, SubscriptionStatus } from '@acsp/database';

/** Manual plan management for SUPER_ADMIN. Stripe-driven changes arrive in Phase 7. */
export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ enum: Plan })
  @IsOptional()
  @IsEnum(Plan)
  plan?: Plan;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  @IsOptional()
  @IsDateString()
  currentPeriodEnd?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;

  @ApiPropertyOptional({ description: 'Reset wordsUsed/aiCreditsUsed and start a new period' })
  @IsOptional()
  @IsBoolean()
  resetUsage?: boolean;
}
