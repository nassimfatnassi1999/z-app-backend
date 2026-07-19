import { Injectable } from '@nestjs/common';
import { GeneratedEmail, TranscriptExtraction } from '../schemas/ai.schemas';
import { AiProviderRouterService } from './ai-provider-router.service';

@Injectable()
export class EmailGenerationService {
  constructor(private readonly router: AiProviderRouterService) {}

  async generate(input: {
    transcript: string;
    extraction: TranscriptExtraction;
    tone?: string;
    language?: string;
    previousEmail?: string;
  }): Promise<{ value: GeneratedEmail; model: string }> {
    const generated = await this.router.generateEmail(input);
    return {
      model: 'multi-provider',
      value: {
        subject: generated.subject,
        body: generated.body,
        confidence: generated.confidence,
        language: input.extraction.language,
        recipient: input.extraction.recipient ?? '',
      },
    };
  }
}
