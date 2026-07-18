import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailboxController } from './mailbox.controller';
import { MailboxEvents } from './mailbox.events';
import { MailboxGateway } from './mailbox.gateway';
import { MailboxService } from './mailbox.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { EmailsController } from './emails.controller';

@Module({
  imports: [PrismaModule, JwtModule.register({}), ConfigModule, NotificationsModule],
  controllers: [MailboxController, EmailsController],
  providers: [MailboxService, MailboxGateway, MailboxEvents, IdempotencyService],
})
export class MailboxModule {}
