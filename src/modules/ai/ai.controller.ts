import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { GenerateEmailDto } from './dto/generate-email.dto';
import { GenerateReplyDto } from './dto/generate-reply.dto';
import { ExpandEmailDto } from './dto/expand-email.dto';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('generate-email')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  generateEmail(@Body() dto: GenerateEmailDto, @Req() req: Request & { user?: { userId?: string } }) {
    return this.ai.generateEmail(dto, req.user?.userId);
  }

  @Post('generate-reply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  generateReply(@Body() dto: GenerateReplyDto) {
    return this.ai.generateReply(dto);
  }

  @Post('email/expand')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  expandEmail(@Body() dto: ExpandEmailDto) {
    return this.ai.expandEmail(dto);
  }
}
