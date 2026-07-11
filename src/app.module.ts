import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { AiModule } from './modules/ai/ai.module';
import { DraftsModule } from './modules/drafts/drafts.module';
import { SpeechModule } from './modules/speech/speech.module';
import { UsersModule } from './modules/users/users.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { MailboxModule } from './modules/mailbox/mailbox.module';
import { HealthController } from './health.controller';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { AppConfigModule } from './config/app-config.module';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    AuthModule,
    AiModule,
    DraftsModule,
    SpeechModule,
    UsersModule,
    ConversationsModule,
    MailboxModule,
    NotificationsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: RateLimitGuard }],
})
export class AppModule {}
