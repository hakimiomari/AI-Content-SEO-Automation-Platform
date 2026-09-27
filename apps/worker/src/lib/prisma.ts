import { Prisma, PrismaClient } from '@acsp/database';
import { config } from '../config';

declare global {
  var __acspWorkerPrisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  return new PrismaClient({
    log: config.isDev ? ['warn', 'error'] : ['error'],
  });
}

/** Singleton — survives tsx watch reloads in development. */
export const prisma: PrismaClient = globalThis.__acspWorkerPrisma ?? createClient();
if (config.isDev) globalThis.__acspWorkerPrisma = prisma;

/**
 * Converts an arbitrary serialisable value into a Prisma JSON input value.
 * Round-tripping through JSON strips `undefined`, Dates become ISO strings.
 */
export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export async function closePrisma(): Promise<void> {
  await prisma.$disconnect();
}
