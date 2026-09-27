import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Plans, Roles, SubscriptionStatuses } from '@acsp/shared';
import type {
  AuthResponse,
  AuthTokens,
  AuthUser,
  Plan,
  Role,
  SubscriptionStatus,
} from '@acsp/shared';

export class AuthCompanyDto {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() slug: string;
  @ApiProperty({ enum: Plans }) plan: Plan;
  @ApiProperty({ enum: SubscriptionStatuses }) subscriptionStatus: SubscriptionStatus;
}

export class AuthUserDto implements AuthUser {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: Roles }) role: Role;
  @ApiPropertyOptional({ nullable: true }) avatarUrl?: string | null;
  @ApiPropertyOptional({ nullable: true }) companyId?: string | null;
  @ApiPropertyOptional({ type: AuthCompanyDto, nullable: true }) company?: AuthCompanyDto | null;
}

export class AuthTokensDto implements AuthTokens {
  @ApiProperty() accessToken: string;
  @ApiProperty() refreshToken: string;
  @ApiProperty({ description: 'Access token lifetime in seconds' }) expiresIn: number;
}

export class AuthResponseDto implements AuthResponse {
  @ApiProperty({ type: AuthUserDto }) user: AuthUserDto;
  @ApiProperty({ type: AuthTokensDto }) tokens: AuthTokensDto;
}
