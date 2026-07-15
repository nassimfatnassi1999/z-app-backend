import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { GenerateReplyDto } from './dto/generate-reply.dto';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('generate-reply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  generateReply(@Body() dto: GenerateReplyDto) {
    return this.ai.generateReply(dto);
  }
}
