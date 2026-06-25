import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { AiModule } from './modules/ai/ai.module';
import { DraftsModule } from './modules/drafts/drafts.module';
import { SpeechModule } from './modules/speech/speech.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env', expandVariables: true }),
    PrismaModule,
    AuthModule,
    AiModule,
    DraftsModule,
    SpeechModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
