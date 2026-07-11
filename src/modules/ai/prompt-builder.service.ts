import { Injectable } from '@nestjs/common';
import { GenerateEmailDto } from './dto/generate-email.dto';
import { EMAIL_TYPES, GeneratedEmailResponse, GroqMessage, TranscriptAnalysis } from './ai.types';

@Injectable()
export class PromptBuilderService {
  analysis(transcript: string, dto: GenerateEmailDto): GroqMessage[] {
    return [
      {
        role: 'system',
        content: [
          'You analyze voice transcripts for professional email drafting.',
          'Extract only explicitly supported information. Never invent or complete a missing fact.',
          `emailType must be one of: ${EMAIL_TYPES.join(', ')}.`,
          'Return JSON only with: language, intent, emailType, recipient, requestedAction, people, company, dates, times, amounts, places, references, priority, detectedTone, formality, importantInformation, confidence.',
          'Arrays must contain the exact surface values found in the source. confidence is between 0 and 1.',
        ].join(' '),
      },
      { role: 'user', content: JSON.stringify({ transcript, providedContext: this.context(dto) }) },
    ];
  }

  generation(
    transcript: string,
    analysis: TranscriptAnalysis,
    dto: GenerateEmailDto,
  ): GroqMessage[] {
    return [
      {
        role: 'system',
        content: [
          'You are a specialist professional email-writing assistant. Understand the real intention behind a voice transcript; do not merely paraphrase it.',
          'Reconstruct a natural, directly sendable email as a skilled human assistant would write it.',
          'Preserve every important fact, including all names, dates, times, amounts, places, companies, and references. Correct errors, remove speech artifacts and repetition, reorganize ideas, and add only useful transitions.',
          'Never invent, infer, alter, or omit a fact. If essential information is absent, omit it or use neutral wording such as the language-equivalent of “as agreed”, “on the planned date”, or “following our conversation”; never fabricate a value.',
          'Adapt style to the detected email type, relationship, requested tone, language, and formality. Short input still needs a proportionate greeting, natural body, and closing, without unsupported detail.',
          'The subject must be specific, natural, and at most 8 words. Never use generic subjects such as Email, Message, Objet, or Sans objet.',
          'Do not add an invented sender name or signature. The result must not mention AI or sound machine-generated.',
          'Return JSON only with exactly: language, tone, intent, subject, body, suggestedRecipient.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({ transcript, analysis, context: this.context(dto) }),
      },
    ];
  }

  repair(
    transcript: string,
    analysis: TranscriptAnalysis,
    dto: GenerateEmailDto,
    draft: GeneratedEmailResponse | null,
    issues: string[],
  ): GroqMessage[] {
    const messages = this.generation(transcript, analysis, dto);
    messages.push({
      role: 'user',
      content: JSON.stringify({
        task: 'Repair the draft once. Resolve every validation issue while preserving all source facts.',
        previousDraft: draft,
        validationIssues: issues,
      }),
    });
    return messages;
  }

  private context(dto: GenerateEmailDto) {
    return {
      detectedLanguage: dto.language || 'auto',
      recipientName: dto.recipientName,
      relationship: dto.relationship,
      requestedTone: dto.tone || 'auto',
      customTone: dto.customTone,
      length: dto.length || 'auto',
      subject: dto.subject,
      providedIntent: dto.intent,
      providedEmailType: dto.emailType,
      userContext: dto.userContext,
      history: dto.history,
      currentBody: dto.currentBody,
      template: dto.template || dto.templateKey,
    };
  }
}
