import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { fetchWithTimeout } from '../../../common/http/fetch-with-timeout';
import { BusinessException } from '../../../common/errors/business-error';

type ModelKind = 'extraction' | 'generation' | 'validation';

@Injectable()
export class GroqJsonProvider {
  constructor(private readonly config: ConfigService) {}

  async complete<T>(options: {
    kind: ModelKind;
    prompt: string;
    input: unknown;
    schema: z.ZodType<T>;
    temperature: number;
  }): Promise<{ value: T; model: string }> {
    const apiKey = this.config.get<string>('GROQ_API_KEY')!;
    const model = this.modelFor(options.kind);
    const baseUrl = this.config.get<string>('GROQ_BASE_URL')!;
    const timeoutMs = Number(this.config.get<string>('AI_REQUEST_TIMEOUT_MS'));
    const response = await fetchWithTimeout(
      `${baseUrl.replace(/\/$/, '')}/chat/completions`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: options.temperature,
          top_p: 0.15,
          presence_penalty: 0,
          frequency_penalty: 0,
          seed: 7,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: options.prompt },
            { role: 'user', content: JSON.stringify(options.input) },
          ],
        }),
      },
      { timeoutMs, retries: 0, errorMessage: 'AI provider request failed' },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException({
        success: false,
        error: {
          code: 'AI_PROVIDER_TIMEOUT',
          message: 'Le service de rédaction est indisponible.',
          retryable: true,
        },
      });
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    try {
      const parsed: unknown = JSON.parse(payload.choices?.[0]?.message?.content ?? '');
      return { value: options.schema.parse(parsed), model };
    } catch {
      throw new BusinessException(
        'AI_INVALID_OUTPUT',
        'La réponse générée est invalide.',
        true,
        502,
      );
    }
  }

  private modelFor(kind: ModelKind) {
    const key =
      kind === 'extraction'
        ? 'GROQ_EXTRACTION_MODEL'
        : kind === 'validation'
          ? 'GROQ_VALIDATION_MODEL'
          : 'GROQ_EMAIL_MODEL';
    return this.config.get<string>(key)!;
  }
}
