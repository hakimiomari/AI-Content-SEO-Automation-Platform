import type { Request } from 'express';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

/** Client ip + user agent for audit logs and refresh-token records. */
export function getRequestMeta(req: Request): RequestMeta {
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return {
    ip: (forwardedIp?.trim() || req.ip || req.socket?.remoteAddress || null)?.slice(0, 64) ?? null,
    userAgent: req.headers['user-agent']?.slice(0, 512) ?? null,
  };
}
