import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Mirrors `passwordSchema` in `@acsp/shared`: 8-128 chars, one upper, one lower, one digit. */
export function IsStrongPassword(description = 'Password') {
  return applyDecorators(
    ApiProperty({
      description: `${description}: min 8 chars, one uppercase, one lowercase, one digit`,
      example: 'Password123',
      minLength: 8,
      maxLength: 128,
    }),
    IsString(),
    MinLength(8, { message: 'Password must be at least 8 characters' }),
    MaxLength(128),
    Matches(/[A-Z]/, { message: 'Add at least one uppercase letter' }),
    Matches(/[a-z]/, { message: 'Add at least one lowercase letter' }),
    Matches(/[0-9]/, { message: 'Add at least one number' }),
  );
}
