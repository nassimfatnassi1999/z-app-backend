import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { GenerateEmailDto } from './dto/generate-email.dto';

@ApiTags('ai')
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('generate-email')
  generateEmail(@Body() dto: GenerateEmailDto) {
    return this.ai.generateEmail(dto);
  }
}
