import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { fetchWithTimeout } from '../../../common/http/fetch-with-timeout';
import { BusinessException } from '../../../common/errors/business-error';
import type { PromptDefinition } from '../prompts/registry';

type ModelKind = 'extraction' | 'generation' | 'validation';

@Injectable()
export class GroqJsonProvider {
  private readonly logger = new Logger(GroqJsonProvider.name);

  constructor(private readonly config: ConfigService) {}

  async complete<T>(options: {
    kind: ModelKind;
    prompt: string | PromptDefinition;
    input: unknown;
    schema: z.ZodType<T, z.ZodTypeDef, unknown>;
    temperature: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  }): Promise<{ value: T; model: string }> {
    const apiKey = this.config.get<string>('GROQ_API_KEY')!;
    const model = this.modelFor(options.kind);
    const baseUrl = this.config.get<string>('GROQ_BASE_URL')!;
    const timeoutMs = this.numberConfig(
      'GROQ_TIMEOUT_MS',
      this.numberConfig('AI_REQUEST_TIMEOUT_MS', 30_000),
    );
    const maxTokens = this.numberConfig('GROQ_MAX_TOKENS', 1200);
    const prompt =
      typeof options.prompt === 'string'
        ? { id: 'unregistered', version: 'legacy', template: options.prompt }
        : options.prompt;
    const temperature =
      options.kind === 'generation'
        ? this.numberConfig('GROQ_TEMPERATURE', options.temperature)
        : options.temperature;
    const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const startedAt = Date.now();
    const initialResponse = await this.request({
      endpoint,
      apiKey,
      model,
      timeoutMs,
      temperature,
      topP: options.topP ?? 0.15,
      presencePenalty: options.presencePenalty ?? 0,
      frequencyPenalty: options.frequencyPenalty ?? 0,
      maxTokens,
      messages: [
        { role: 'system', content: prompt.template },
        { role: 'user', content: JSON.stringify(options.input) },
      ],
    });
    const initialContent = initialResponse.content;
    const initial = this.parse(options.schema, initialContent);
    if (initial.success) {
      this.logCompletion(prompt, model, startedAt, 'success', 1, initialResponse.totalTokens);
      return { value: initial.data, model };
    }

    this.logger.warn(
      `provider=groq event=invalid_json kind=${options.kind} model=${model} repairAttempt=1 issueCount=${initial.issueCount}`,
    );
    const repairedResponse = await this.request({
      endpoint,
      apiKey,
      model,
      timeoutMs,
      temperature: 0,
      topP: 0.15,
      presencePenalty: 0,
      frequencyPenalty: 0,
      maxTokens,
      messages: [
        { role: 'system', content: prompt.template },
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
    const repairedContent = repairedResponse.content;
    const repaired = this.parse(options.schema, repairedContent);
    if (repaired.success) {
      this.logCompletion(
        prompt,
        model,
        startedAt,
        'repaired',
        2,
        this.sumTokens(initialResponse.totalTokens, repairedResponse.totalTokens),
      );
      return { value: repaired.data, model };
    }

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
    topP: number;
    presencePenalty: number;
    frequencyPenalty: number;
    maxTokens: number;
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
            top_p: options.topP,
            presence_penalty: options.presencePenalty,
            frequency_penalty: options.frequencyPenalty,
            max_tokens: options.maxTokens,
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
        usage?: { total_tokens?: number };
      };
      return {
        content: payload.choices?.[0]?.message?.content ?? '',
        totalTokens: payload.usage?.total_tokens,
      };
    } catch {
      throw new BusinessException(
        'AI_PROVIDER_ERROR',
        'Le service de rédaction a retourné une réponse illisible.',
        true,
        502,
      );
    }
  }

  private parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, content: string) {
    try {
      const cleaned = content
        .trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      const parsed: unknown = JSON.parse(cleaned);
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

  private numberConfig(name: string, fallback: number) {
    const value = Number(this.config.get<string>(name));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private logCompletion(
    prompt: Pick<PromptDefinition, 'id' | 'version'>,
    model: string,
    startedAt: number,
    status: string,
    attempts: number,
    tokenCount?: number,
  ) {
    this.logger.log(
      `promptId=${prompt.id} promptVersion=${prompt.version} model=${model} latencyMs=${Date.now() - startedAt} tokenCount=${tokenCount ?? 'unavailable'} status=${status} attempts=${attempts}`,
    );
  }

  private sumTokens(first?: number, second?: number) {
    if (first == null && second == null) return undefined;
    return (first ?? 0) + (second ?? 0);
  }
}
