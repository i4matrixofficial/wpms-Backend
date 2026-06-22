import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body =
      exception instanceof HttpException ? exception.getResponse() : null;

    res.status(status).json({
      success: false,
      data: null,
      error: {
        code: status,
        message:
          typeof body === 'object' && body !== null
            ? ((body as Record<string, unknown>).message ?? 'Error')
            : (body ?? 'Internal server error'),
        details:
          typeof body === 'object'
            ? (body as Record<string, unknown>).errors
            : undefined,
      },
      timestamp: new Date().toISOString(),
    });
  }
}
