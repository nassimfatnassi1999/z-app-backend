import { Test } from '@nestjs/testing';
import { AppConfigService } from './config/app-config.service';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma/prisma.service';

describe('HealthController', () => {
  it('reports database and provider configuration without calling providers', async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: AppConfigService, useValue: { deepgramApiKey: 'dg', groqApiKey: 'groq' } },
        { provide: PrismaService, useValue: { isConnected: true } },
      ],
    }).compile();

    expect(module.get(HealthController).health()).toEqual({
      status: 'ok',
      database: 'ok',
      deepgramConfigured: true,
      groqConfigured: true,
    });
  });
});
