import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { GenerateEmailDto } from './dto/generate-email.dto';
import { GenerateReplyDto } from './dto/generate-reply.dto';
import { ExpandEmailDto } from './dto/expand-email.dto';
import { EmailGenerationService } from './email-generation.service';
import { BadRequestException } from '@nestjs/common';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly emailGeneration: EmailGenerationService,
  ) {}

  @Post('test-groq')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  testGroq(@Body() body: { text?: string }) {
    const text = body.text?.trim();
    if (!text) throw new BadRequestException('text is required');
    return this.emailGeneration.diagnose(text);
  }

  @Post('generate-email')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  generateEmail(@Body() dto: GenerateEmailDto) {
    return this.ai.generateEmail(dto);
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
