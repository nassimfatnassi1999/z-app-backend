import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { DateExtractorService } from './date-extractor.service';
import { EmailPlannerService } from './email-planner.service';
import { EmailValidatorService } from './email-validator.service';
import { FallbackGeneratorService } from './fallback-generator.service';
import { IntentExtractorService } from './intent-extractor.service';
import { LanguageDetectorService } from './language-detector.service';
import { LanguageNormalizerService } from './language-normalizer.service';
import { PromptBuilderService } from './prompt-builder.service';
import { RecipientDetectorService } from './recipient-detector.service';
import { TranscriptAnalyzerService } from './transcript-analyzer.service';

@Module({
  controllers: [AiController],
  providers: [
    AiService,
    LanguageNormalizerService,
    LanguageDetectorService,
    TranscriptAnalyzerService,
    IntentExtractorService,
    EmailPlannerService,
    PromptBuilderService,
    EmailValidatorService,
    RecipientDetectorService,
    DateExtractorService,
    FallbackGeneratorService,
  ],
  exports: [AiService],
})
export class AiModule {}
