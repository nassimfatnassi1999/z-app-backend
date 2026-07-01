import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Request } from 'express';

type Bucket = { count: number; resetAt: number };

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly buckets = new Map<string, Bucket>();
  private requestsSinceSweep = 0;

  canActivate(context: ExecutionContext) {
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    const { limit, windowMs } = this.policy(request.path);
    const key = `${this.identity(request)}:${request.method}:${request.path}`;
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
    } else {
      bucket.count += 1;
      if (bucket.count > limit) {
        this.logger.warn(`rate_limit_exceeded method=${request.method} path=${request.path}`);
        throw new HttpException(
          { code: 'RATE_LIMITED', message: 'Too many requests. Please retry later.' },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    if (++this.requestsSinceSweep >= 500) {
      this.requestsSinceSweep = 0;
      for (const [bucketKey, value] of this.buckets) {
        if (value.resetAt <= now) this.buckets.delete(bucketKey);
      }
    }
    return true;
  }

  private policy(path: string) {
    if (path.includes('/ai/')) return { limit: 10, windowMs: 60_000 };
    if (path.includes('/speech/')) return { limit: 15, windowMs: 60_000 };
    if (/\/auth\/(login|register|verify-email|resend-verification-code|refresh)/.test(path)) {
      return { limit: 10, windowMs: 60_000 };
    }
    if (path.includes('/users/search')) return { limit: 30, windowMs: 60_000 };
    return { limit: 120, windowMs: 60_000 };
  }

  private identity(request: Request) {
    const authorization = request.headers.authorization;
    if (authorization) {
      return createHash('sha256').update(authorization).digest('hex').slice(0, 24);
    }
    return request.ip || request.socket.remoteAddress || 'unknown';
  }
}
