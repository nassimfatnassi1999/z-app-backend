import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BusinessException } from '../../../common/errors/business-error';
import { generationPromptVersion } from '../prompts/registry';
import { EmailGenerationService } from './email-generation.service';
import { EmailRepairService } from './email-repair.service';
import { EmailValidationService } from './email-validation.service';
import { TranscriptExtractionService } from './transcript-extraction.service';

@Injectable()
export class AiOrchestratorService {
  constructor(
    private readonly extraction: TranscriptExtractionService,
    private readonly generation: EmailGenerationService,
    private readonly validation: EmailValidationService,
    private readonly repair: EmailRepairService,
  ) {}

  async compose(input: {
    transcript: string;
    language?: string;
    tone?: string;
    previousEmail?: string;
  }) {
    const extracted = await this.extraction.extract(input.transcript, input.language, input.tone);
    if (extracted.value.needsClarification) {
      return {
        status: 'needs_clarification' as const,
        questions: extracted.value.clarificationQuestions,
        extraction: extracted.value,
      };
    }
    const generated = await this.generation.generate({ ...input, extraction: extracted.value });
    let email = generated.value;
    let validation = await this.validation.validate(input.transcript, extracted.value, email);
    let retryUsed = false;
    if (!validation.pass) {
      retryUsed = true;
      email = (
        await this.repair.repair({
          transcript: input.transcript,
          extraction: extracted.value,
          email,
          validation,
        })
      ).value;
      validation = await this.validation.validate(input.transcript, extracted.value, email);
    }
    if (!validation.pass)
      throw new BusinessException(
        'AI_VALIDATION_FAILED',
        'Le résultat ne respecte pas suffisamment votre demande.',
        true,
        422,
      );
    return {
      status: 'completed' as const,
      email,
      extraction: extracted.value,
      validation,
      metadata: {
        generationId: randomUUID(),
        model: generated.model,
        promptVersion: generationPromptVersion,
        retryUsed,
        qualityScore: 1,
      },
    };
  }
}
