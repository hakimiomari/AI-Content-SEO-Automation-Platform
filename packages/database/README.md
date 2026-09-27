# @acsp/database

Thin wrapper around the generated Prisma client.

- Schema lives in [`/prisma/schema.prisma`](../../prisma/schema.prisma)
- Run `pnpm db:generate` from the repo root (also runs on `pnpm install`)
- Import with `import { PrismaClient, Role } from '@acsp/database'`
