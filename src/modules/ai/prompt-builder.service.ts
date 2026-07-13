import { Injectable } from '@nestjs/common';
import { GenerateEmailDto } from './dto/generate-email.dto';
import { EMAIL_TYPES, EmailIntentAnalysis, GroqMessage } from './ai.types';
import { PromptId, PromptRegistry } from './prompts/prompt-registry';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PromptBuilderService {
  constructor(
    private readonly registry: PromptRegistry = new PromptRegistry(),
    private readonly config?: ConfigService,
  ) {}

  private get version(): 'v1' | 'v2' {
    return this.config?.get<string>('AI_EMAIL_PROMPT_VERSION', 'v2') === 'v1' ? 'v1' : 'v2';
  }

  promptId(kind: 'analysis' | 'generation' | 'rewrite' | 'repair'): PromptId {
    return `email-${kind}.${this.version}` as PromptId;
  }

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
    return this.build(this.promptId('analysis'), {
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
    return this.build(this.promptId(dto.currentBody ? 'rewrite' : 'generation'), {
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
