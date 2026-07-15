import { Injectable } from '@nestjs/common';
import { generationPromptV1 } from '../prompts/registry';
import {
  GeneratedEmail,
  generatedEmailContentSchema,
  TranscriptExtraction,
} from '../schemas/ai.schemas';
import { GroqJsonProvider } from '../providers/groq-json.provider';

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
      prompt: generationPromptV1,
      input,
      schema: generatedEmailContentSchema,
      temperature: 0.1,
    });
    return {
      model: generated.model,
      value: {
        ...generated.value,
        language: input.extraction.language,
        tone: 'professional',
        intent: input.extraction.intent,
        recipientSuggestion: input.extraction.recipient,
      },
    };
  }
}
