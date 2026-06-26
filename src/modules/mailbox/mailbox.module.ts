import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from '../../prisma/prisma.module';
import { MailboxController } from './mailbox.controller';
import { MailboxEvents } from './mailbox.events';
import { MailboxGateway } from './mailbox.gateway';
import { MailboxService } from './mailbox.service';

@Module({
  imports: [PrismaModule, JwtModule.register({}), ConfigModule],
  controllers: [MailboxController],
  providers: [MailboxService, MailboxGateway, MailboxEvents],
})
export class MailboxModule {}
