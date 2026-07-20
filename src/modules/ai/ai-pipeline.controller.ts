import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ComposeEmailDto } from './dto/compose-email.dto';
import { ValidateEmailDto } from './dto/validate-email.dto';
import { generatedEmailContentSchema } from './schemas/ai.schemas';
import { AiOrchestratorService } from './services/ai-orchestrator.service';
import { EmailValidationService } from './services/email-validation.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiPipelineController {
  constructor(
    private readonly orchestrator: AiOrchestratorService,
    private readonly validation: EmailValidationService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('extract')
  extract(@Body() dto: ComposeEmailDto) {
    return this.orchestrator.normalizeForCompatibility(dto.transcript, dto.language, dto.tone);
  }

  @Post('generate-email-v2')
  generate(@Body() dto: ComposeEmailDto, @Headers('idempotency-key') key?: string) {
    return this.idempotency.run('ai:compose', key, () => this.orchestrator.compose(dto));
  }

  @Post('validate-email')
  validate(@Body() dto: ValidateEmailDto) {
    const legacy = dto.email as Record<string, unknown>;
    const email = generatedEmailContentSchema.parse({
      subject: legacy.subject,
      body: legacy.body,
      detectedLanguage: legacy.detectedLanguage ?? legacy.language ?? 'unknown',
      detectedTone: legacy.detectedTone ?? legacy.tone ?? 'professional',
      emailType: legacy.emailType ?? legacy.intent ?? 'information',
      confidence: legacy.confidence ?? 0.5,
    });
    return this.validation.validate(dto.transcript, email, String(legacy.language ?? ''));
  }
}
