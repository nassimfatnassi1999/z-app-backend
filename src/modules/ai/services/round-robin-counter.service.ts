import { Injectable } from '@nestjs/common';

export interface RoundRobinCounter {
  next(providerCount: number): number | Promise<number>;
}

@Injectable()
export class InMemoryRoundRobinCounter implements RoundRobinCounter {
  private counter = 0;

  next(providerCount: number) {
    const index = this.counter % providerCount;
    this.counter = (this.counter + 1) % Number.MAX_SAFE_INTEGER;
    return index;
  }
}
