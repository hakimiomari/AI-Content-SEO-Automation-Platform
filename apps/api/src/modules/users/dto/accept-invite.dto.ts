import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length, MinLength } from 'class-validator';
import { IsStrongPassword } from '../../auth/dto/password.validators';

export class AcceptInviteDto {
  @ApiProperty({ description: 'Invitation token from the invite link' })
  @IsString()
  @MinLength(10)
  token: string;

  @ApiProperty({ example: 'John Editor', minLength: 2, maxLength: 80 })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(2, 80)
  name: string;

  @IsStrongPassword()
  password: string;
}
