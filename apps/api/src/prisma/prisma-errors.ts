import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@acsp/database';

export function isPrismaError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

export function isUniqueConstraintError(
  error: unknown,
): error is Prisma.PrismaClientKnownRequestError {
  return isPrismaError(error) && error.code === 'P2002';
}

export function isNotFoundError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return isPrismaError(error) && error.code === 'P2025';
}

/**
 * Translates well-known Prisma errors into HTTP exceptions with a clean message.
 * Anything else is re-thrown untouched so the global filter can log it as a 500.
 */
export function rethrowPrismaError(error: unknown, entity = 'Record'): never {
  if (isUniqueConstraintError(error)) {
    const target = error.meta?.target;
    const fields = Array.isArray(target) ? target.join(', ') : String(target ?? 'field');
    throw new ConflictException(`${entity} with this ${fields} already exists`);
  }
  if (isNotFoundError(error)) {
    throw new NotFoundException(`${entity} not found`);
  }
  throw error;
}
