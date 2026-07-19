import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AiProviderError } from '../providers/ai-provider.error';
import { GeneratedEmail } from '../providers/email-ai-provider.types';

const generatedEmailResponseSchema = z
  .object({
    subject: z.string().trim().min(2).max(160),
    body: z.string().trim().min(10).max(50_000),
    detectedLanguage: z.string().trim().min(2).max(35),
    detectedRecipientType: z.string().trim().min(1).max(80),
    detectedRelationship: z.string().trim().min(1).max(80),
    detectedTone: z.string().trim().min(1).max(80),
    emailIntent: z.string().trim().min(1).max(120),
    emailComplexity: z.string().trim().min(1).max(80),
    confidence: z.number().min(0).max(1),
    validationWarnings: z.array(z.string().trim().min(1).max(500)).max(30),
  })
  .strict();

@Injectable()
export class AiResponseParserService {
  parse(content: string): GeneratedEmail {
    const normalized = content.trim();
    if (!normalized) {
      throw new AiProviderError('empty_response', 'AI provider returned an empty response');
    }

    const withoutFence = normalized
      .replace(/^\s*```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    const firstBrace = withoutFence.indexOf('{');
    const lastBrace = withoutFence.lastIndexOf('}');
    if (firstBrace < 0 || lastBrace < firstBrace) {
      throw new AiProviderError('invalid_json', 'AI provider response does not contain JSON');
    }

    let value: unknown;
    try {
      value = JSON.parse(withoutFence.slice(firstBrace, lastBrace + 1));
    } catch (error) {
      throw new AiProviderError('invalid_json', 'AI provider returned invalid JSON', undefined, {
        cause: error,
      });
    }

    const result = generatedEmailResponseSchema.safeParse(value);
    if (!result.success) {
      throw new AiProviderError(
        'invalid_output',
        `AI provider returned an invalid email (${result.error.issues.length} validation issues)`,
      );
    }
    return result.data;
  }
}
