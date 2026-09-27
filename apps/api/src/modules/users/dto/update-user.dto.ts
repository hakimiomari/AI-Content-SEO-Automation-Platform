import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUrl, Length, ValidateIf } from 'class-validator';
import type { Role } from '@acsp/database';

/** Roles a company admin may assign. SUPER_ADMIN is platform-only and never assignable via API. */
export const ASSIGNABLE_ROLES = ['COMPANY_ADMIN', 'CONTENT_MANAGER', 'COMPANY_USER'] as const;
export type AssignableRole = Exclude<Role, 'SUPER_ADMIN'>;

export class UpdateUserDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 80 })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 80)
  name?: string;

  @ApiPropertyOptional({ nullable: true, format: 'url' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUrl({ require_tld: false })
  avatarUrl?: string | null;

  @ApiPropertyOptional({ enum: ASSIGNABLE_ROLES })
  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES)
  role?: AssignableRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
