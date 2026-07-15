import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { fetchWithTimeout } from '../../../common/http/fetch-with-timeout';
import { BusinessException } from '../../../common/errors/business-error';

type ModelKind = 'extraction' | 'generation' | 'validation';

@Injectable()
export class GroqJsonProvider {
  private readonly logger = new Logger(GroqJsonProvider.name);

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
    const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const initialContent = await this.request({
      endpoint,
      apiKey,
      model,
      timeoutMs,
      temperature: options.temperature,
      messages: [
        { role: 'system', content: options.prompt },
        { role: 'user', content: JSON.stringify(options.input) },
      ],
    });
    const initial = this.parse(options.schema, initialContent);
    if (initial.success) return { value: initial.data, model };

    this.logger.warn(
      `provider=groq event=invalid_json kind=${options.kind} model=${model} repairAttempt=1 issueCount=${initial.issueCount}`,
    );
    const repairedContent = await this.request({
      endpoint,
      apiKey,
      model,
      timeoutMs,
      temperature: 0,
      messages: [
        { role: 'system', content: options.prompt },
        {
          role: 'user',
          content: JSON.stringify({
            task: 'Repair the previous response. Return one valid JSON object that follows the system contract exactly. Preserve the original input. Do not use Markdown or code fences.',
            originalInput: options.input,
            previousResponse: initialContent,
          }),
        },
      ],
    });
    const repaired = this.parse(options.schema, repairedContent);
    if (repaired.success) return { value: repaired.data, model };

    this.logger.warn(
      `provider=groq event=invalid_json kind=${options.kind} model=${model} repairAttempt=exhausted issueCount=${repaired.issueCount}`,
    );
    throw new BusinessException(
      'AI_INVALID_OUTPUT',
      'La réponse générée ne respecte pas le format attendu.',
      true,
      502,
    );
  }

  private async request(options: {
    endpoint: string;
    apiKey: string;
    model: string;
    timeoutMs: number;
    temperature: number;
    messages: Array<{ role: 'system' | 'user'; content: string }>;
  }) {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        options.endpoint,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: options.model,
            temperature: options.temperature,
            top_p: 0.15,
            presence_penalty: 0,
            frequency_penalty: 0,
            seed: 7,
            response_format: { type: 'json_object' },
            messages: options.messages,
          }),
        },
        {
          timeoutMs: options.timeoutMs,
          retries: 0,
          errorMessage: 'AI provider request failed',
        },
      );
    } catch (error) {
      this.logger.warn(
        `provider=groq event=request_failed model=${options.model} reason=timeout_or_network`,
      );
      throw new BusinessException(
        'AI_PROVIDER_TIMEOUT',
        'Le service de rédaction met trop de temps à répondre.',
        true,
        504,
      );
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      this.throwForStatus(response.status, options.model);
    }

    try {
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return payload.choices?.[0]?.message?.content ?? '';
    } catch {
      throw new BusinessException(
        'AI_PROVIDER_ERROR',
        'Le service de rédaction a retourné une réponse illisible.',
        true,
        502,
      );
    }
  }

  private parse<T>(schema: z.ZodType<T>, content: string) {
    try {
      const parsed: unknown = JSON.parse(content);
      const result = schema.safeParse(parsed);
      if (result.success) {
        return { success: true as const, data: result.data, issueCount: 0 };
      }
      return { success: false as const, issueCount: result.error.issues.length };
    } catch {
      return { success: false as const, issueCount: 1 };
    }
  }

  private throwForStatus(status: number, model: string): never {
    this.logger.warn(`provider=groq event=http_error model=${model} status=${status}`);
    if (status === 401 || status === 403) {
      throw new BusinessException(
        'AI_PROVIDER_UNAUTHORIZED',
        'La configuration du service de rédaction est invalide.',
        false,
        502,
      );
    }
    if (status === 429) {
      throw new BusinessException(
        'AI_PROVIDER_RATE_LIMIT',
        'Le service de rédaction est temporairement saturé.',
        true,
        429,
      );
    }
    throw new BusinessException(
      'AI_PROVIDER_ERROR',
      'Le service de rédaction est temporairement indisponible.',
      status >= 500,
      502,
    );
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
