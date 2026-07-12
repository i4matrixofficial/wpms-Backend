import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { Logger } from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('AllExceptionsFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    if (!(exception instanceof HttpException)) {
      this.logger.error('Unhandled exception', exception as Error);
    }

    const body =
      exception instanceof HttpException ? exception.getResponse() : null;

    // body can be: a string, or an object like { message, errors? }
    let message: unknown = 'Internal server error';
    let details: unknown = undefined;

    if (typeof body === 'string') {
      message = body;
    } else if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      message = b.message ?? 'Error';
      details = b.errors;
    }

    res.status(status).json({
      success: false,
      data: null,
      error: { code: status, message, details },
      timestamp: new Date().toISOString(),
    });
  }
}
