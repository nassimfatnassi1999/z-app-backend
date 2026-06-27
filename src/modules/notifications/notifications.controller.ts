import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RegisterDeviceDto } from './dto/register-device.dto';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';
import { NotificationsService } from './notifications.service';

type AuthRequest = Request & { user: { userId: string } };

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}
  @Post('devices') register(@Req() req: AuthRequest, @Body() dto: RegisterDeviceDto) {
    return this.notifications.registerDevice(req.user.userId, dto);
  }
  @Delete('devices/:token') revoke(@Req() req: AuthRequest, @Param('token') token: string) {
    return this.notifications.revokeDevice(req.user.userId, token);
  }
  @Get('settings') settings(@Req() req: AuthRequest) {
    return this.notifications.settings(req.user.userId);
  }
  @Patch('settings') updateSettings(
    @Req() req: AuthRequest,
    @Body() dto: UpdateNotificationSettingsDto,
  ) {
    return this.notifications.updateSettings(req.user.userId, dto);
  }
}
