import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiPropertyOptional({
    description: 'Refresh token. Optional when the `refresh_token` cookie is present.',
  })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
