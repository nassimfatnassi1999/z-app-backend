import { Injectable } from '@nestjs/common';
import { GenerateEmailDto } from './dto/generate-email.dto';
import { EMAIL_TYPES, EmailIntentAnalysis, GroqMessage } from './ai.types';
import { PromptId, PromptRegistry } from './prompts/prompt-registry';

@Injectable()
export class PromptBuilderService {
  constructor(private readonly registry: PromptRegistry = new PromptRegistry()) {}

  build(id: PromptId, input: Record<string, unknown>): GroqMessage[] {
    const built = this.registry.get<Record<string, unknown>>(id).build(input);
    return [
      { role: 'system', content: built.system },
      { role: 'user', content: built.user },
    ];
  }

  analysis(
    rawTranscription: string,
    cleanedTranscription: string,
    dto: GenerateEmailDto,
  ): GroqMessage[] {
    return this.build('email-analysis.v1', {
      rawTranscription,
      cleanedTranscription,
      preferences: this.context(dto),
      allowedEmailTypes: EMAIL_TYPES,
    });
  }

  generation(
    rawTranscription: string,
    cleanedTranscription: string,
    analysis: EmailIntentAnalysis,
    dto: GenerateEmailDto,
    previousEmail?: unknown,
  ): GroqMessage[] {
    return this.build(dto.currentBody ? 'email-rewrite.v1' : 'email-generation.v1', {
      sourceContext: {
        analysis,
        rawTranscript: rawTranscription,
        normalizedTranscript: cleanedTranscription,
        preferences: this.context(dto),
        targetEnrichmentLevel: dto.enrichmentLevel || 'medium',
      },
      editedDraft: previousEmail,
      instruction: dto.userInstruction,
    });
  }

  private context(dto: GenerateEmailDto) {
    return {
      detectedLanguage: dto.detectedSpeechLanguage || dto.language,
      requestedOutputLanguage: dto.effectiveOutputLanguage,
      requestedTone: dto.tone || 'auto',
      customTone: dto.customTone,
      requestedLength: dto.length || 'auto',
      enrichmentLevel: dto.enrichmentLevel || 'medium',
      recipientName: dto.recipientName,
      relationship: dto.relationship,
      emailType: dto.emailType,
      currentBody: dto.currentBody,
      template: dto.template || dto.templateKey,
    };
  }
}
