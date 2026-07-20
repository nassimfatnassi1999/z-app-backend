import { Injectable } from '@nestjs/common';
import {
  EmailPreferences,
  GeneratedEmail,
  GeneratedEmailContent,
} from '../providers/email-ai-provider.types';
import { AiProviderRouterService } from './ai-provider-router.service';

@Injectable()
export class EmailGenerationService {
  constructor(private readonly router: AiProviderRouterService) {}

  async generate(
    transcript: string,
    preferences: EmailPreferences,
    requestId: string,
    previousEmail?: string,
  ): Promise<{ email: GeneratedEmail; attempts: number; fallbackReasons: string[] }> {
    const result = await this.router.generateEmail(
      { transcript, preferences, previousEmail, mode: 'generation' },
      requestId,
    );
    return {
      email: {
        ...result.email,
        provider: result.provider,
        model: result.model,
        repaired: false,
      },
      attempts: result.attempts,
      fallbackReasons: result.fallbackReasons,
    };
  }
}

export type { GeneratedEmail, GeneratedEmailContent };
