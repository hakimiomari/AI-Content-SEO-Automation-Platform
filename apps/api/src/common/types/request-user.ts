import type { Role } from '@acsp/database';

/** The principal attached to `req.user` by `JwtStrategy`. */
export interface RequestUser {
  id: string;
  email: string;
  role: Role;
  companyId: string | null;
}
