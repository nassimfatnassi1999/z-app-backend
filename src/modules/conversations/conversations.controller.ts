import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { CreateDirectConversationDto } from './dto/create-direct-conversation.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { SendGeneratedEmailDto } from './dto/send-generated-email.dto';

type AuthRequest = Request & { user: { userId: string; email: string } };

@ApiTags('conversations')
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Post('conversations/direct')
  createDirect(@Req() req: AuthRequest, @Body() dto: CreateDirectConversationDto) {
    return this.conversations.createOrOpenDirect(req.user.userId, dto.userId);
  }

  @Get('conversations')
  list(@Req() req: AuthRequest) {
    return this.conversations.list(req.user.userId);
  }

  @Get('conversations/:id/messages')
  messages(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Query('page') page = '1',
    @Query('limit') limit = '30',
  ) {
    return this.conversations.messages(req.user.userId, id, Number(page), Number(limit));
  }

  @Post('conversations/:id/messages')
  sendMessage(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: CreateMessageDto) {
    return this.conversations.sendMessage(req.user.userId, id, dto.content, dto.messageType);
  }

  @Post('conversations/:id/messages/generated-email')
  sendGeneratedEmail(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: SendGeneratedEmailDto,
  ) {
    return this.conversations.sendGeneratedEmail(req.user.userId, id, dto.draftId);
  }

  @Delete('messages/:id')
  deleteMessage(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.conversations.deleteMessage(req.user.userId, id);
  }
}
