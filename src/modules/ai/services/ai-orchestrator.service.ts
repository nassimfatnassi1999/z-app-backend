import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ComposeEmailDto } from '../dto/compose-email.dto';
import { EMAIL_GENERATION_PROMPT_VERSION } from '../prompts/email-generation.prompt';
import { EmailPreferences, GeneratedEmail } from '../providers/email-ai-provider.types';
import { EmailGenerationService } from './email-generation.service';
import { EmailRepairService } from './email-repair.service';
import { EmailValidationService } from './email-validation.service';
import { TranscriptNormalizerService } from './transcript-normalizer.service';
import { EmailDraftValidationError } from '../ai-pipeline.error';

@Injectable()
export class AiOrchestratorService {
  private readonly logger = new Logger(AiOrchestratorService.name);

  constructor(
    private readonly normalizer: TranscriptNormalizerService,
    private readonly generation: EmailGenerationService,
    private readonly validation: EmailValidationService,
    private readonly repair: EmailRepairService,
  ) {}

  async compose(input: ComposeEmailDto & { requestId?: string }) {
    const requestId = input.requestId || randomUUID();
    const startedAt = Date.now();
    const transcript = this.normalizer.normalize(input.transcript, requestId);
    const expectedLanguage = this.normalizer.detectLanguage(transcript, input.language);
    const preferences: EmailPreferences = {
      language: expectedLanguage,
      tone: input.tone,
      recipient: input.recipient,
      formality: input.formality,
      length: input.length,
    };

    const generated = await this.generation.generate(
      transcript,
      preferences,
      requestId,
      input.previousEmail,
    );
    let email = generated.email;
    let result = this.validation.validate(transcript, email, expectedLanguage);
    let attempts = generated.attempts;
    const fallbackReasons = [...generated.fallbackReasons];

    if (!result.valid) {
      this.logger.warn(
        JSON.stringify({
          event: 'email_validation_failed',
          requestId,
          stage: 'generation',
          errors: result.errors,
        }),
      );
      const repaired = await this.repair.repair({
        transcript,
        preferences,
        invalidEmail: email,
        errors: result.errors,
        requestId,
      });
      email = repaired.email;
      attempts += repaired.attempts;
      fallbackReasons.push(...repaired.fallbackReasons);
      result = this.validation.validate(transcript, email, expectedLanguage);
    }

    if (!result.valid) {
      throw new EmailDraftValidationError(
        requestId,
        result.errors.map((code) => ({ code, message: code })),
      );
    }

    const durationMs = Date.now() - startedAt;
    this.logger.log(
      JSON.stringify({
        event: 'email_generation_completed',
        requestId,
        durationMs,
        provider: email.provider,
        model: email.model,
        attempts,
        repaired: email.repaired,
        detectedLanguage: email.detectedLanguage,
        emailType: email.emailType,
        fallbackReasons,
        transcriptChars: transcript.length,
        emailChars: email.body.length,
      }),
    );

    return {
      status: 'completed' as const,
      email: this.compatibilityEmail(email),
      extraction: this.compatibilityExtraction(transcript, expectedLanguage, input.tone),
      validation: {
        pass: true,
        errors: [],
        warnings: result.warnings,
        criticalFacts: result.criticalFacts,
      },
      metadata: {
        generationId: randomUUID(),
        requestId,
        provider: email.provider,
        model: email.model,
        promptVersion: EMAIL_GENERATION_PROMPT_VERSION,
        retryUsed: email.repaired,
        repairUsed: email.repaired,
        fallbackUsed: fallbackReasons.length > 0,
        fallbackReasons,
        attempts,
        durationMs,
        qualityScore: email.confidence,
      },
    };
  }

  normalizeForCompatibility(transcript: string, language?: string, tone?: string) {
    const normalized = this.normalizer.normalize(transcript);
    const detectedLanguage = this.normalizer.detectLanguage(normalized, language);
    return this.compatibilityExtraction(normalized, detectedLanguage, tone);
  }

  private compatibilityEmail(email: GeneratedEmail) {
    return {
      ...email,
      language: email.detectedLanguage,
      tone: email.detectedTone,
      intent: email.emailType,
      recipient: '',
      suggestedRecipient: '',
    };
  }

  private compatibilityExtraction(transcript: string, language: string, tone?: string) {
    return {
      language,
      intent: 'compose_email',
      recipient: null,
      facts: [],
      constraints: [],
      requestedActions: [],
      dates:
        transcript.match(/\b\d{1,2}\s+\p{L}+|\b(?:demain|today|tomorrow|vendredi|friday)\b/giu) ??
        [],
      amounts: transcript.match(/\b\d+(?:[.,]\d+)?\s?(?:€|\$|£|TND|EUR|USD)?\b/giu) ?? [],
      names: [],
      keywords: [],
      transcriptionCorrections: [],
      tone: tone || 'professional',
      ambiguities: [],
      needsClarification: false,
      clarificationQuestions: [],
    };
  }
}
