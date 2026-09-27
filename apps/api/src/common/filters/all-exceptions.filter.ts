import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '@acsp/database';

export interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
  requestId?: string;
}

const isProduction = process.env.NODE_ENV === 'production';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();

    const { status, message, error } = this.normalize(exception);

    const body: ErrorBody = {
      statusCode: status,
      message,
      error,
      path: req.originalUrl ?? req.url,
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
    };

    if (status >= 500) {
      const stack = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`${req.method} ${body.path} -> ${status} [${req.requestId ?? '-'}]`, stack);
    }

    if (res.headersSent) return;
    res.status(status).json(body);
  }

  private normalize(exception: unknown): {
    status: number;
    message: string | string[];
    error: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        return { status, message: response, error: exception.name };
      }
      const obj = response as { message?: string | string[]; error?: string };
      return {
        status,
        message: obj.message ?? exception.message,
        error: obj.error ?? HttpStatus[status] ?? exception.name,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        const target = exception.meta?.target;
        const fields = Array.isArray(target) ? target.join(', ') : 'field';
        return {
          status: HttpStatus.CONFLICT,
          message: `A record with this ${fields} already exists`,
          error: 'Conflict',
        };
      }
      if (exception.code === 'P2025') {
        return { status: HttpStatus.NOT_FOUND, message: 'Record not found', error: 'Not Found' };
      }
      if (exception.code === 'P2003') {
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Related record does not exist',
          error: 'Bad Request',
        };
      }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        message: isProduction
          ? 'Invalid request'
          : (exception.message.split('\n').pop() ?? 'Invalid request'),
        error: 'Bad Request',
      };
    }

    const internal = exception instanceof Error ? exception.message : 'Unexpected error';
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: isProduction ? 'Internal server error' : internal,
      error: 'Internal Server Error',
    };
  }
}
