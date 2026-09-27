import { UnrecoverableError } from 'bullmq';

/** Returns a readable message for any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** Thrown when the job payload cannot be processed no matter how many times it is retried. */
export class InvalidJobPayloadError extends UnrecoverableError {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidJobPayloadError';
  }
}

/** Thrown when a tenant-owned entity is missing or belongs to a different company. */
export class EntityNotFoundError extends UnrecoverableError {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found or not accessible for this company`);
    this.name = 'EntityNotFoundError';
  }
}
