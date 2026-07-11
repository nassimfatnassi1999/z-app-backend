import { Controller, Get } from '@nestjs/common';
import { AppConfigService } from './config/app-config.service';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  health() {
    return {
      status: this.prisma.isConnected ? 'ok' : 'degraded',
      database: this.prisma.isConnected ? 'ok' : 'unavailable',
      deepgramConfigured: Boolean(this.config.deepgramApiKey),
      groqConfigured: Boolean(this.config.groqApiKey),
    };
  }
}
