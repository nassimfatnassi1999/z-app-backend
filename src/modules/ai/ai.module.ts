import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiPipelineController } from './ai-pipeline.controller';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { GroqJsonProvider } from './providers/groq-json.provider';
import { TranscriptExtractionService } from './services/transcript-extraction.service';
import { EmailGenerationService } from './services/email-generation.service';
import { EmailValidationService } from './services/email-validation.service';
import { EmailRepairService } from './services/email-repair.service';
import { AiOrchestratorService } from './services/ai-orchestrator.service';

@Module({
  controllers: [AiController, AiPipelineController],
  providers: [
    AiService,
    IdempotencyService,
    GroqJsonProvider,
    TranscriptExtractionService,
    EmailGenerationService,
    EmailValidationService,
    EmailRepairService,
    AiOrchestratorService,
  ],
  exports: [AiService, AiOrchestratorService, IdempotencyService],
})
export class AiModule {}
