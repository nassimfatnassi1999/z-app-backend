import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ComposeEmailDto } from './dto/compose-email.dto';
import { ValidateEmailDto } from './dto/validate-email.dto';
import { generatedEmailSchema, transcriptExtractionSchema } from './schemas/ai.schemas';
import { AiOrchestratorService } from './services/ai-orchestrator.service';
import { EmailGenerationService } from './services/email-generation.service';
import { EmailValidationService } from './services/email-validation.service';
import { TranscriptExtractionService } from './services/transcript-extraction.service';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiPipelineController {
  constructor(
    private readonly orchestrator: AiOrchestratorService,
    private readonly extraction: TranscriptExtractionService,
    private readonly generation: EmailGenerationService,
    private readonly validation: EmailValidationService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('extract')
  extract(@Body() dto: ComposeEmailDto) {
    return this.extraction
      .extract(dto.transcript, dto.language, dto.tone)
      .then((result) => result.value);
  }

  @Post('generate-email-v2')
  generate(@Body() dto: ComposeEmailDto, @Headers('idempotency-key') key?: string) {
    return this.idempotency.run('ai:compose', key, () => this.orchestrator.compose(dto));
  }

  @Post('validate-email')
  validate(@Body() dto: ValidateEmailDto) {
    return this.validation.validate(
      dto.transcript,
      transcriptExtractionSchema.parse(dto.extraction),
      generatedEmailSchema.parse(dto.email),
    );
  }

  @Post('transform-email')
  transform(@Body() dto: ComposeEmailDto, @Headers('idempotency-key') key?: string) {
    return this.idempotency.run('ai:transform', key, async () => {
      const extraction = (await this.extraction.extract(dto.transcript, dto.language, dto.tone))
        .value;
      return (await this.generation.generate({ ...dto, extraction })).value;
    });
  }
}
