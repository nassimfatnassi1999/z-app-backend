import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string;
    let error: string;
    let extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as any;
        const structuredError = res.error && typeof res.error === 'object' ? res.error : undefined;
        message = Array.isArray(res.message)
          ? res.message.join(', ')
          : res.message || structuredError?.message || exception.message;
        error = structuredError || res.error || exception.message;
        extra = Object.fromEntries(
          Object.entries(res).filter(([key]) => !['statusCode', 'message', 'error'].includes(key)),
        );
      } else {
        message = String(exceptionResponse);
        error = exception.message;
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      error = 'Internal Server Error';
      this.logger.error('Unhandled exception', exception);
    }

    response.status(status).json({
      success: false,
      data: null,
      message,
      error,
      ...extra,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
