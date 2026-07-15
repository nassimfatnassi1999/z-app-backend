import { Injectable } from '@nestjs/common';
import { repairPromptV1 } from '../prompts/registry';
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
      prompt: repairPromptV1,
      input,
      schema: generatedEmailSchema,
      temperature: 0.1,
      topP: 0.2,
      presencePenalty: 0,
      frequencyPenalty: 0.1,
    });
    return {
      model: repaired.model,
      value: {
        ...repaired.value,
        language: input.extraction.language,
        recipient: input.extraction.recipient ?? '',
      },
    };
  }
}
