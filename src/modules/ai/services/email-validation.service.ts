import { Injectable } from '@nestjs/common';
import { validationPromptV1 } from '../prompts/registry';
import {
  EmailValidation,
  emailValidationSchema,
  GeneratedEmail,
  TranscriptExtraction,
} from '../schemas/ai.schemas';
import { GroqJsonProvider } from '../providers/groq-json.provider';

@Injectable()
export class EmailValidationService {
  constructor(private readonly groq: GroqJsonProvider) {}
  async validate(
    transcript: string,
    extraction: TranscriptExtraction,
    email: GeneratedEmail,
  ): Promise<EmailValidation> {
    const result = await this.groq.complete({
      kind: 'validation',
      prompt: validationPromptV1,
      input: { transcript, extraction, email },
      schema: emailValidationSchema,
      temperature: 0,
    });
    const value = result.value;
    return {
      ...value,
      pass:
        value.pass &&
        value.supportedFacts &&
        value.negationPreserved &&
        value.languageMatch &&
        value.toneMatch &&
        value.actionClear &&
        value.missingFacts.length === 0 &&
        value.unsupportedClaims.length === 0,
    };
  }
}
