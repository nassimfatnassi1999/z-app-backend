import { Injectable } from '@nestjs/common';
import {
  EmailPreferences,
  GeneratedEmail,
  GeneratedEmailContent,
} from '../providers/email-ai-provider.types';
import { AiProviderRouterService } from './ai-provider-router.service';

@Injectable()
export class EmailRepairService {
  constructor(private readonly router: AiProviderRouterService) {}

  async repair(input: {
    transcript: string;
    preferences: EmailPreferences;
    invalidEmail: GeneratedEmailContent;
    errors: string[];
    requestId: string;
  }): Promise<{ email: GeneratedEmail; attempts: number; fallbackReasons: string[] }> {
    const result = await this.router.generateEmail(
      {
        transcript: input.transcript,
        preferences: input.preferences,
        mode: 'repair',
        invalidEmail: input.invalidEmail,
        validationErrors: input.errors,
      },
      input.requestId,
    );
    return {
      email: {
        ...result.email,
        provider: result.provider,
        model: result.model,
        repaired: true,
      },
      attempts: result.attempts,
      fallbackReasons: result.fallbackReasons,
    };
  }
}
