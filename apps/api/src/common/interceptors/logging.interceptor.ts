import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import type { RequestWithId } from '../middleware/request-id.middleware';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<RequestWithId>();
    const res = http.getResponse<Response>();
    const started = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.log(req, res.statusCode, started),
        error: (err: unknown) => {
          const status =
            typeof err === 'object' && err !== null && 'getStatus' in err
              ? (err as { getStatus: () => number }).getStatus()
              : 500;
          this.log(req, status, started);
        },
      }),
    );
  }

  private log(req: Request & { requestId?: string }, status: number, started: number): void {
    const ms = Date.now() - started;
    const line = `${req.method} ${req.originalUrl} ${status} ${ms}ms [${req.requestId ?? '-'}]`;
    if (status >= 500) this.logger.error(line);
    else if (status >= 400) this.logger.warn(line);
    else this.logger.log(line);
  }
}
