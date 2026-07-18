import { Body, Controller, Delete, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Request } from 'express';
import { EmailStatus } from '../../common/enums/email-status.enum';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BatchDeleteEmailsDto } from './dto/batch-delete-emails.dto';
import { MailboxService } from './mailbox.service';

type AuthRequest = Request & { user: { userId: string; email: string } };

class EmailStatusQuery {
  @IsEnum(EmailStatus)
  status!: EmailStatus;
}

@ApiTags('emails')
@Controller('emails')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EmailsController {
  constructor(private readonly mailbox: MailboxService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: EmailStatusQuery) {
    return this.mailbox.listByStatus(req.user.userId, query.status);
  }

  @Delete('batch')
  deleteBatch(@Req() req: AuthRequest, @Body() dto: BatchDeleteEmailsDto) {
    return this.mailbox.deleteBatch(req.user.userId, dto.emailIds);
  }
}
