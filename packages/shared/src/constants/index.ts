export * from './plans';
export * from './roles';
export * from './queues';

export const COOKIE_NAMES = {
  ACCESS: 'access_token',
  REFRESH: 'refresh_token',
} as const;

export const PAGINATION = { DEFAULT_PAGE: 1, DEFAULT_LIMIT: 20, MAX_LIMIT: 100 } as const;
