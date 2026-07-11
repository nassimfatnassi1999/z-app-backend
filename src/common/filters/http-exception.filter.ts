import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AiPipelineException } from '../../modules/ai/ai-pipeline.error';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    let status: number;
    let message: string;
    let error: string;
    let extra: Record<string, unknown> = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as any;
        message = Array.isArray(res.message) ? res.message.join(', ') : res.message;
        error = res.error || exception.message;
        extra = Object.fromEntries(
          Object.entries(res).filter(([key]) => !['statusCode', 'message', 'error'].includes(key)),
        );
      } else {
        message = String(exceptionResponse);
        error = exception.message;
      }
      if (exception instanceof AiPipelineException) {
        this.logger.error(
          JSON.stringify({
            event: 'ai_pipeline_error',
            requestId: exception.requestId,
            code: exception.code,
            retryable: exception.retryable,
            errorType: exception.constructor.name,
            internalMessage: exception.internalMessage,
          }),
          exception.stack,
        );
      }
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      error = 'Internal Server Error';
      this.logger.error('Unhandled exception', exception);
    }

    const requestId = String(extra.requestId || request.requestId || 'unknown');
    response.status(status).json({
      success: false,
      data: null,
      message,
      error,
      ...extra,
      requestId,
      errorDetails: {
        code: String(extra.code || 'UNKNOWN_ERROR'),
        message,
        retryable: Boolean(extra.retryable),
        requestId,
      },
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
