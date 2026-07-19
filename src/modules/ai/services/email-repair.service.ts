import { Injectable } from '@nestjs/common';
import { emailRepairPrompt } from '../prompts/registry';
import {
  EmailValidation,
  GeneratedEmail,
  generatedEmailSchema,
  TranscriptExtraction,
} from '../schemas/ai.schemas';
import { GroqJsonProvider } from '../providers/groq-json.provider';

@Injectable()
export class EmailRepairService {
  constructor(private readonly groq: GroqJsonProvider) {}
  async repair(input: {
    transcript: string;
    extraction: TranscriptExtraction;
    email: GeneratedEmail;
    validation: EmailValidation;
  }) {
    const repaired = await this.groq.complete({
      kind: 'generation',
      prompt: emailRepairPrompt,
      input: {
        analysis: input.extraction,
        correctedTranscript: input.extraction.correctedTranscript,
        email: input.email,
        validation: input.validation,
      },
      schema: generatedEmailSchema,
      temperature: 0.25,
      topP: 0.6,
      presencePenalty: 0,
      frequencyPenalty: 0.1,
    });
    return {
      model: repaired.model,
      value: {
        ...repaired.value,
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
