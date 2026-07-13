import { Injectable } from '@nestjs/common';

type Entry = { expiresAt: number; promise: Promise<unknown> };

@Injectable()
export class IdempotencyService {
  private readonly entries = new Map<string, Entry>();

  run<T>(scope: string, key: string | undefined, operation: () => Promise<T>): Promise<T> {
    if (!key?.trim()) return operation();
    const cacheKey = `${scope}:${key.trim()}`;
    const current = this.entries.get(cacheKey);
    if (current && current.expiresAt > Date.now()) return current.promise as Promise<T>;

    const promise = operation().catch((error) => {
      this.entries.delete(cacheKey);
      throw error;
    });
    this.entries.set(cacheKey, { expiresAt: Date.now() + 10 * 60_000, promise });
    this.prune();
    return promise;
  }

  private prune() {
    if (this.entries.size < 500) return;
    const now = Date.now();
    for (const [key, value] of this.entries) if (value.expiresAt <= now) this.entries.delete(key);
  }
}
