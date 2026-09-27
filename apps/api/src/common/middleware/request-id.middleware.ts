import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

export type RequestWithId = Request & { requestId: string };

/** Ensures every request carries a correlation id (reused when the client sends one). */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if ((req as RequestWithId).requestId) {
      next();
      return;
    }
    const incoming = req.headers[REQUEST_ID_HEADER];
    const id =
      typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128
        ? incoming
        : randomUUID();
    (req as RequestWithId).requestId = id;
    res.setHeader(REQUEST_ID_HEADER, id);
    next();
  }
}
