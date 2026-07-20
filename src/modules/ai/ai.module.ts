import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiPipelineController } from './ai-pipeline.controller';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { EmailGenerationService } from './services/email-generation.service';
import { EmailValidationService } from './services/email-validation.service';
import { EmailRepairService } from './services/email-repair.service';
import { AiOrchestratorService } from './services/ai-orchestrator.service';
import { TranscriptNormalizerService } from './services/transcript-normalizer.service';
import { AiResponseParserService } from './services/ai-response-parser.service';
import { AiProviderRouterService } from './services/ai-provider-router.service';
import { InMemoryRoundRobinCounter } from './services/round-robin-counter.service';
import { GroqEmailAiProvider } from './providers/groq-email-ai.provider';
import { GeminiEmailAiProvider } from './providers/gemini-email-ai.provider';
import { OpenRouterEmailAiProvider } from './providers/openrouter-email-ai.provider';

@Module({
  controllers: [AiController, AiPipelineController],
  providers: [
    AiService,
    IdempotencyService,
    TranscriptNormalizerService,
    EmailGenerationService,
    EmailValidationService,
    EmailRepairService,
    AiOrchestratorService,
    AiResponseParserService,
    GroqEmailAiProvider,
    GeminiEmailAiProvider,
    OpenRouterEmailAiProvider,
    InMemoryRoundRobinCounter,
    AiProviderRouterService,
  ],
  exports: [AiService, AiOrchestratorService, IdempotencyService],
})
export class AiModule {}
