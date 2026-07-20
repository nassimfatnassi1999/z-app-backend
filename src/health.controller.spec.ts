import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma/prisma.service';

describe('HealthController', () => {
  it('reports readiness after checking the database', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: { $queryRaw: queryRaw } }],
    }).compile();

    await expect(module.get(HealthController).health()).resolves.toMatchObject({
      status: 'ok',
      service: 'z-backend',
      database: 'connected',
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
