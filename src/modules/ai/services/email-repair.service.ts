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
  repair(input: {
    transcript: string;
    extraction: TranscriptExtraction;
    email: GeneratedEmail;
    validation: EmailValidation;
  }) {
    return this.groq.complete({
      kind: 'generation',
      prompt: repairPromptV1,
      input,
      schema: generatedEmailSchema,
      temperature: 0.05,
    });
  }
}
