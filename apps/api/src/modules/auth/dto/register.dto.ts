import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length } from 'class-validator';
import { IsStrongPassword } from './password.validators';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @ApiProperty({ example: 'Jane Doe', minLength: 2, maxLength: 80 })
  @Transform(trim)
  @IsString()
  @Length(2, 80, { message: 'Name is too short' })
  name: string;

  @ApiProperty({ example: 'jane@acme.com' })
  @Transform(lower)
  @IsEmail({}, { message: 'Enter a valid email' })
  email: string;

  @IsStrongPassword()
  password: string;

  @ApiProperty({ example: 'Acme Inc', minLength: 2, maxLength: 120 })
  @Transform(trim)
  @IsString()
  @Length(2, 120, { message: 'Company name is too short' })
  companyName: string;
}
