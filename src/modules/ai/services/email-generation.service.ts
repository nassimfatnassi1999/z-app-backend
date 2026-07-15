import { Injectable } from '@nestjs/common';
import { generationPromptV1 } from '../prompts/registry';
import { GeneratedEmail, generatedEmailSchema, TranscriptExtraction } from '../schemas/ai.schemas';
import { GroqJsonProvider } from '../providers/groq-json.provider';

@Injectable()
export class EmailGenerationService {
  constructor(private readonly groq: GroqJsonProvider) {}

  generate(input: {
    transcript: string;
    extraction: TranscriptExtraction;
    tone?: string;
    language?: string;
    previousEmail?: string;
  }): Promise<{ value: GeneratedEmail; model: string }> {
    return this.groq.complete({
      kind: 'generation',
      prompt: generationPromptV1,
      input,
      schema: generatedEmailSchema,
      temperature: 0.1,
    });
  }
}
