import type { AuthResponse, AuthUser, LoginInput, RegisterInput } from '@acsp/shared';
import { api } from './api-client';

/**
 * Thin wrappers over the auth endpoints. Cookies (`access_token`, `refresh_token`)
 * are set by the API as httpOnly, so the browser never touches tokens directly.
 */
export function login(input: LoginInput): Promise<AuthResponse> {
  return api.post<AuthResponse>('/auth/login', input);
}

export function register(input: RegisterInput): Promise<AuthResponse> {
  return api.post<AuthResponse>('/auth/register', input);
}

export function logout(): Promise<void> {
  return api.post<void>('/auth/logout', undefined, { retryOn401: false });
}

export function getMe(): Promise<AuthUser> {
  return api.get<AuthUser>('/auth/me');
}

export function refreshSession(): Promise<AuthResponse> {
  return api.post<AuthResponse>('/auth/refresh', undefined, { retryOn401: false });
}
