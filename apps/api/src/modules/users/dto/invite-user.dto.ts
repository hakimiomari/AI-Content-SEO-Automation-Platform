import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ASSIGNABLE_ROLES, type AssignableRole } from './update-user.dto';

export class InviteUserDto {
  @ApiProperty({ example: 'editor@acme.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ enum: ASSIGNABLE_ROLES, default: 'COMPANY_USER' })
  @IsOptional()
  @IsIn(ASSIGNABLE_ROLES)
  role: AssignableRole = 'COMPANY_USER';

  @ApiPropertyOptional({ description: 'SUPER_ADMIN only: invite into another company' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  companyId?: string;
}
