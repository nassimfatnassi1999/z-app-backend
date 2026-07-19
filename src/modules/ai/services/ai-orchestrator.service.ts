import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { generationPromptVersion } from '../prompts/registry';
import { EmailGenerationService } from './email-generation.service';
import { EmailRepairService } from './email-repair.service';
import { EmailValidationService } from './email-validation.service';
import { TranscriptExtractionService } from './transcript-extraction.service';
import { FactualConsistencyService } from './factual-consistency.service';
import { BusinessException } from '../../../common/errors/business-error';

@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger(AiOrchestratorService.name);

  constructor(
    private readonly extraction: TranscriptExtractionService,
    private readonly generation: EmailGenerationService,
    private readonly validation: EmailValidationService,
    private readonly repair: EmailRepairService,
    private readonly consistency: FactualConsistencyService,
  ) {}

  async compose(input: {
    transcript: string;
    language?: string;
    tone?: string;
    previousEmail?: string;
  }) {
    const extracted = await this.extraction.extract(input.transcript, input.language, input.tone);
    const generated = await this.generation.generate({ ...input, extraction: extracted.value });
    let email = generated.value;
    let validation = await this.validation.validate(input.transcript, extracted.value, email);
    let audit = this.consistency.audit(input.transcript, email, extracted.value);
    validation = this.withDeterministicAudit(validation, audit);
    let retryUsed = false;
    if (!validation.pass || validation.qualityScore.overall < 0.82) {
      retryUsed = true;
      this.logRejection('initial', input.transcript, email.body, audit, validation);
      email = (
        await this.repair.repair({
          transcript: input.transcript,
          extraction: extracted.value,
          email,
          validation,
        })
      ).value;
      validation = await this.validation.validate(input.transcript, extracted.value, email);
      audit = this.consistency.audit(input.transcript, email, extracted.value);
      validation = this.withDeterministicAudit(validation, audit);
    }
    if (!validation.pass || validation.qualityScore.overall < 0.82) {
      this.logRejection('repair', input.transcript, email.body, audit, validation);
      throw new BusinessException(
        'AI_GENERATION_FAILED',
        'La génération n’a pas atteint le niveau de qualité requis. Réessayez.',
        true,
        502,
      );
    }
    email = {
      ...email,
      detectedLanguage: extracted.value.detectedLanguage,
      recipient: extracted.value.recipient ?? '',
      confidence: Math.min(email.confidence, validation.qualityScore.overall),
      validationWarnings: validation.validationWarnings,
    };
    this.logger.log(
      `AI comparison completed transcriptChars=${input.transcript.length} emailChars=${email.body.length} retryUsed=${retryUsed} fallbackUsed=false`,
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
        fallbackUsed: false,
        qualityScore: validation.qualityScore,
      },
    };
  }

  private withDeterministicAudit(
    validation: Awaited<ReturnType<EmailValidationService['validate']>>,
    audit: ReturnType<FactualConsistencyService['audit']>,
  ) {
    if (audit.pass) return validation;
    return {
      ...validation,
      supportedFacts: false,
      missingFacts: [
        ...validation.missingFacts,
        ...audit.missing.map((issue) => `Missing ${issue.kind}: ${issue.value}`),
      ],
      unsupportedClaims: [
        ...validation.unsupportedClaims,
        ...audit.unsupported.map((issue) => `Unsupported ${issue.kind}: ${issue.value}`),
      ],
      pass: false,
    };
  }

  private logRejection(
    stage: string,
    transcript: string,
    emailBody: string,
    audit: ReturnType<FactualConsistencyService['audit']>,
    validation: Awaited<ReturnType<EmailValidationService['validate']>>,
  ) {
    this.logger.warn(
      `AI output rejected stage=${stage} transcriptChars=${transcript.length} emailChars=${emailBody.length} unsupportedByKind=${JSON.stringify(audit.counts)} missingByKind=${JSON.stringify(audit.missingCounts)} missingFactCount=${validation.missingFacts.length} unsupportedClaimCount=${validation.unsupportedClaims.length}`,
    );
  }
}
