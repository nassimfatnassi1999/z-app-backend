import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SendEmailDto } from './dto/send-email.dto';
import { MailboxService } from './mailbox.service';

type AuthRequest = Request & { user: { userId: string; email: string } };

@ApiTags('mailbox')
@Controller('mailbox')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MailboxController {
  constructor(private readonly mailbox: MailboxService) {}

  @Get()
  list(
    @Req() req: AuthRequest,
    @Query('folder')
    folder: 'inbox' | 'sent' | 'drafts' | 'trash' | 'favorites' | 'unread' = 'inbox',
    @Query('q') q = '',
  ) {
    return this.mailbox.list(req.user.userId, folder, q);
  }

  @Get('unread-count')
  unreadCount(@Req() req: AuthRequest) {
    return this.mailbox.unreadCount(req.user.userId);
  }

  @Post()
  send(@Req() req: AuthRequest, @Body() dto: SendEmailDto) {
    return this.mailbox.send(req.user.userId, dto);
  }

  @Get(':id')
  detail(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.mailbox.detail(req.user.userId, id);
  }

  @Patch(':id/read')
  markRead(@Req() req: AuthRequest, @Param('id') id: string, @Body('read') read?: boolean) {
    return this.mailbox.markRead(req.user.userId, id, read ?? true);
  }

  @Patch(':id/star')
  star(@Req() req: AuthRequest, @Param('id') id: string, @Body('starred') starred: boolean) {
    return this.mailbox.star(req.user.userId, id, starred);
  }

  @Patch(':id/delete')
  delete(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.mailbox.delete(req.user.userId, id);
  }

  @Patch(':id/restore')
  restore(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.mailbox.restore(req.user.userId, id);
  }

  @Delete('trash')
  emptyTrash(@Req() req: AuthRequest) {
    return this.mailbox.emptyTrash(req.user.userId);
  }

  @Delete(':id')
  removePermanently(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.mailbox.removePermanently(req.user.userId, id);
  }
}
