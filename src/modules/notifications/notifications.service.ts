import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { PushProvider } from './push.provider';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushProvider,
  ) {}

  registerDevice(userId: string, dto: RegisterDeviceDto) {
    return this.prisma.devicePushToken.upsert({
      where: { token: dto.token },
      create: { ...dto, userId },
      update: { ...dto, userId, revokedAt: null, lastSeenAt: new Date() },
      select: { id: true, platform: true, deviceId: true, appVersion: true, lastSeenAt: true },
    });
  }

  async revokeDevice(userId: string, token: string) {
    const result = await this.prisma.devicePushToken.updateMany({
      where: { userId, token },
      data: { revokedAt: new Date(), lastSeenAt: new Date() },
    });
    return { success: true, revoked: result.count > 0 };
  }

  async settings(userId: string) {
    return (
      (await this.prisma.notificationSettings.findUnique({ where: { userId } })) ?? {
        userId,
        newEmails: true,
        sound: true,
        vibration: true,
      }
    );
  }

  updateSettings(userId: string, dto: UpdateNotificationSettingsDto) {
    return this.prisma.notificationSettings.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
  }

  async sendNewEmail(input: {
    recipientId: string;
    senderId: string;
    senderName: string;
    emailId: string;
    subject: string;
  }) {
    if (input.recipientId === input.senderId) return;
    try {
      const settings = await this.settings(input.recipientId);
      if (!settings.newEmails) return;
      const devices = await this.prisma.devicePushToken.findMany({
        where: { userId: input.recipientId, revokedAt: null },
        select: { token: true },
      });
      const result = await this.push.sendNewEmail(
        devices.map((device) => device.token),
        {
          emailId: input.emailId,
          senderName: input.senderName,
          subject: input.subject,
          sound: settings.sound,
        },
      );
      if (result.invalidTokens.length)
        await this.prisma.devicePushToken.updateMany({
          where: { token: { in: result.invalidTokens } },
          data: { revokedAt: new Date() },
        });
    } catch (error) {
      this.logger.warn(`Push delivery failed without blocking email: ${(error as Error).message}`);
    }
  }
}
