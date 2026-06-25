import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, any> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<any> {
    const request = _context.switchToHttp().getRequest<{ url?: string }>();
    const shouldReturnRaw =
      request.url?.endsWith('/health') || request.url?.endsWith('/speech/transcribe');

    return next.handle().pipe(
      map((data) =>
        shouldReturnRaw
          ? data
          : {
              success: true,
              data,
              timestamp: new Date().toISOString(),
            },
      ),
    );
  }
}
