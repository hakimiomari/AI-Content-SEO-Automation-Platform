import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@acsp/database';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditEntry {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  userId?: string | null;
  companyId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

const REDACTED_KEYS = new Set(['passwordHash', 'password', 'credentials', 'token', 'tokenHash']);

/** Strips secrets before persisting a snapshot. */
export function redact(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk);
    if (input instanceof Date) return input.toISOString();
    if (typeof input === 'object' && input !== null) {
      const out: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
        out[key] = REDACTED_KEYS.has(key) ? '[redacted]' : walk(val);
      }
      return out;
    }
    if (typeof input === 'bigint') return input.toString();
    return input;
  };
  return walk(value) as Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fire-and-forget: audit failures must never break the request that triggered them.
   * Returns a promise only so tests can await it.
   */
  log(entry: AuditEntry): Promise<void> {
    return this.prisma.auditLog
      .create({
        data: {
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          before: redact(entry.before),
          after: redact(entry.after),
          userId: entry.userId ?? null,
          companyId: entry.companyId ?? null,
          ipAddress: entry.ip ?? null,
          userAgent: entry.userAgent?.slice(0, 512) ?? null,
        },
      })
      .then(() => undefined)
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Audit log failed (${entry.action} ${entry.entity}): ${message}`);
      });
  }
}
