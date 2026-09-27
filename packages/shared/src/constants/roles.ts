import type { Role } from '../enums';

export const ROLE_HIERARCHY: Record<Role, number> = {
  SUPER_ADMIN: 100,
  COMPANY_ADMIN: 80,
  CONTENT_MANAGER: 50,
  COMPANY_USER: 10,
};

export const Permissions = {
  'platform:manage': ['SUPER_ADMIN'],
  'company:manage': ['SUPER_ADMIN', 'COMPANY_ADMIN'],
  'billing:manage': ['SUPER_ADMIN', 'COMPANY_ADMIN'],
  'integrations:manage': ['SUPER_ADMIN', 'COMPANY_ADMIN'],
  'users:invite': ['SUPER_ADMIN', 'COMPANY_ADMIN'],
  'projects:write': ['SUPER_ADMIN', 'COMPANY_ADMIN', 'CONTENT_MANAGER'],
  'content:write': ['SUPER_ADMIN', 'COMPANY_ADMIN', 'CONTENT_MANAGER'],
  'content:publish': ['SUPER_ADMIN', 'COMPANY_ADMIN', 'CONTENT_MANAGER'],
  'content:read': ['SUPER_ADMIN', 'COMPANY_ADMIN', 'CONTENT_MANAGER', 'COMPANY_USER'],
  'analytics:read': ['SUPER_ADMIN', 'COMPANY_ADMIN', 'CONTENT_MANAGER', 'COMPANY_USER'],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof Permissions;

export function hasPermission(role: Role, permission: Permission): boolean {
  return (Permissions[permission] as readonly Role[]).includes(role);
}

export function roleAtLeast(role: Role, required: Role): boolean {
  return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[required];
}
