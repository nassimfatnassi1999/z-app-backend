import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService', () => {
  it('shares one in-flight result for the same key', async () => {
    const service = new IdempotencyService();
    let calls = 0;
    const operation = async () => ++calls;
    const [first, second] = await Promise.all([
      service.run('ai', 'same', operation),
      service.run('ai', 'same', operation),
    ]);
    expect([first, second]).toEqual([1, 1]);
    expect(calls).toBe(1);
  });
  it('does not cache failures', async () => {
    const service = new IdempotencyService();
    await expect(
      service.run('ai', 'retry', async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    await expect(service.run('ai', 'retry', async () => 'ok')).resolves.toBe('ok');
  });
});
