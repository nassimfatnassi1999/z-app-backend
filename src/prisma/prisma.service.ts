import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  get isConnected() {
    return this.connected;
  }

  constructor(private readonly config: AppConfigService) {
    super({
      log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.connected = true;
    this.logger.log('Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.connected = false;
  }

  async cleanDatabase() {
    if (this.config.nodeEnvironment === 'production') {
      throw new Error('cleanDatabase() cannot be called in production');
    }
    const models = Reflect.ownKeys(this).filter((k) => k[0] !== '_' && k[0] !== '$');
    return Promise.all(models.map((model) => (this as any)[model].deleteMany()));
  }
}
