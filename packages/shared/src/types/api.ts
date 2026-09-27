import type { Plan, Role, SubscriptionStatus } from '../enums';

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
  requestId?: string;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl?: string | null;
  companyId?: string | null;
  company?: {
    id: string;
    name: string;
    slug: string;
    plan: Plan;
    subscriptionStatus: SubscriptionStatus;
  } | null;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  companyId: string | null;
  type: 'access' | 'refresh';
  jti?: string;
  iat?: number;
  exp?: number;
}
