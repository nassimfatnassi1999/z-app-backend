import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AIAnalysisService } from './ai-analysis.service';
import { EmailGenerationService } from './email-generation.service';
import { EmailValidationService } from './email-validation.service';
import { PromptBuilderService } from './prompt-builder.service';
import { TranscriptCleanerService } from './transcript-cleaner.service';
import { PromptRegistry } from './prompts/prompt-registry';

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    AIAnalysisService,
    EmailGenerationService,
    EmailValidationService,
    PromptBuilderService,
    TranscriptCleanerService,
    PromptRegistry,
  ],
  exports: [AiService, EmailGenerationService],
})
export class AiModule {}
