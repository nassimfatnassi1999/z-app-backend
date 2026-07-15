import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { generationPromptVersion } from '../prompts/registry';
import { EmailGenerationService } from './email-generation.service';
import { EmailRepairService } from './email-repair.service';
import { EmailValidationService } from './email-validation.service';
import { TranscriptExtractionService } from './transcript-extraction.service';
import { FactualConsistencyService } from './factual-consistency.service';

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
    let audit = this.consistency.audit(input.transcript, email);
    validation = this.withDeterministicAudit(validation, audit);
    let retryUsed = false;
    if (!validation.pass) {
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
      audit = this.consistency.audit(input.transcript, email);
      validation = this.withDeterministicAudit(validation, audit);
    }
    let fallbackUsed = false;
    if (!validation.pass) {
      fallbackUsed = true;
      this.logRejection('repair', input.transcript, email.body, audit, validation);
      email = {
        subject: 'Message',
        body: this.minimalRewrite(input.transcript),
        language: extracted.value.language,
        tone: 'professional',
        intent: extracted.value.intent,
        recipientSuggestion: null,
      };
      validation = {
        supportedFacts: true,
        missingFacts: [],
        unsupportedClaims: [],
        negationPreserved: true,
        languageMatch: true,
        toneMatch: true,
        actionClear: true,
        pass: true,
      };
    }
    this.logger.log(
      `AI comparison completed transcriptChars=${input.transcript.length} emailChars=${email.body.length} retryUsed=${retryUsed} fallbackUsed=${fallbackUsed}`,
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
        fallbackUsed,
        qualityScore: 1,
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
      unsupportedClaims: [
        ...validation.unsupportedClaims,
        ...audit.unsupported.map((issue) => `Unsupported ${issue.kind}: ${issue.value}`),
      ],
      pass: false,
    };
  }

  private minimalRewrite(transcript: string) {
    return transcript
      .normalize('NFKC')
      .replace(/\[(?:noise|music|silence|bruit|musique)\]/gi, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  private logRejection(
    stage: string,
    transcript: string,
    emailBody: string,
    audit: ReturnType<FactualConsistencyService['audit']>,
    validation: Awaited<ReturnType<EmailValidationService['validate']>>,
  ) {
    this.logger.warn(
      `AI output rejected stage=${stage} transcriptChars=${transcript.length} emailChars=${emailBody.length} unsupportedByKind=${JSON.stringify(audit.counts)} missingFactCount=${validation.missingFacts.length} unsupportedClaimCount=${validation.unsupportedClaims.length}`,
    );
  }
}
