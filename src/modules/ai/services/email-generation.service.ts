import { Injectable } from '@nestjs/common';
import { emailGenerationPrompt } from '../prompts/registry';
import { GeneratedEmail, generatedEmailSchema, TranscriptExtraction } from '../schemas/ai.schemas';
import { GroqJsonProvider } from '../providers/groq-json.provider';
import { recipientStyleRules } from '../config/recipient-style-rules';

@Injectable()
export class EmailGenerationService {
  constructor(private readonly groq: GroqJsonProvider) {}

  async generate(input: {
    transcript: string;
    extraction: TranscriptExtraction;
    tone?: string;
    language?: string;
    previousEmail?: string;
  }): Promise<{ value: GeneratedEmail; model: string }> {
    const generated = await this.groq.complete({
      kind: 'generation',
      prompt: emailGenerationPrompt,
      input: {
        analysis: input.extraction,
        correctedTranscript: input.extraction.correctedTranscript,
        recipientStyleRules: recipientStyleRules[input.extraction.detectedRecipientType],
        requestedTone: input.tone,
        requestedLanguage: input.language,
      },
      schema: generatedEmailSchema,
      temperature: 0.35,
      topP: 0.7,
      presencePenalty: 0,
      frequencyPenalty: 0.1,
    });
    return {
      model: generated.model,
      value: {
        ...generated.value,
        detectedLanguage: input.extraction.detectedLanguage,
        detectedRecipientType: input.extraction.detectedRecipientType,
        detectedRelationship: input.extraction.detectedRelationship,
        detectedTone: input.extraction.detectedTone,
        emailIntent: input.extraction.emailIntent,
        emailComplexity: input.extraction.emailComplexity,
        recipient: input.extraction.recipient ?? '',
        validationWarnings: [],
      },
    };
  }
}
