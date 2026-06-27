import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { FirebaseProvider } from './firebase.provider';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushProvider } from './push.provider';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    FirebaseProvider,
    { provide: PushProvider, useExisting: FirebaseProvider },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
