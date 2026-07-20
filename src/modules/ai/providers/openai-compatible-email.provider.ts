import OpenAI from 'openai';
import { AiProviderError } from './ai-provider.error';
import { EmailGenerationInput, GeneratedEmailContent } from './email-ai-provider.types';
import { emailProviderPrompt } from './email-provider-prompt';
import { AiResponseParserService } from '../services/ai-response-parser.service';

export abstract class OpenAiCompatibleEmailProvider {
  protected abstract readonly apiKey: string;
  protected abstract readonly baseUrl: string;
  protected abstract readonly temperature: number;
  protected abstract readonly maxTokens: number;
  protected abstract readonly timeoutMs: number;
  protected abstract readonly defaultHeaders: Record<string, string>;
  abstract readonly model: string;

  constructor(protected readonly parser: AiResponseParserService) {}

  isConfigured() {
    return Boolean(this.apiKey.trim() && this.model.trim());
  }

  async generateEmail(
    input: EmailGenerationInput,
    signal?: AbortSignal,
  ): Promise<GeneratedEmailContent> {
    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      defaultHeaders: this.defaultHeaders,
      maxRetries: 0,
      timeout: this.timeoutMs,
    });
    try {
      const prompt = emailProviderPrompt(input);
      const response = await client.chat.completions.create(
        {
          model: this.model,
          temperature: input.mode === 'repair' ? 0.1 : this.temperature,
          max_tokens: this.maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
        },
        { signal },
      );
      return this.parser.parse(response.choices[0]?.message?.content ?? '');
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      throw this.normalizeSdkError(error);
    }
  }

  private normalizeSdkError(error: unknown) {
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status?: unknown }).status)
        : undefined;
    if (status === 401 || status === 403) {
      return new AiProviderError('authentication', 'Invalid AI provider configuration', status, {
        cause: error,
      });
    }
    const providerMessage = error instanceof Error ? error.message.toLowerCase() : '';
    if (status === 404 || providerMessage.includes('model unavailable')) {
      return new AiProviderError('unavailable', 'AI provider model is unavailable', status, {
        cause: error,
      });
    }
    if (status) {
      return new AiProviderError('http', `AI provider HTTP ${status}`, status, { cause: error });
    }
    const name = error instanceof Error ? error.name.toLowerCase() : '';
    const message = providerMessage;
    const timedOut =
      name.includes('timeout') || message.includes('timeout') || message.includes('abort');
    return new AiProviderError(
      timedOut ? 'timeout' : 'network',
      timedOut ? 'AI provider request timed out' : 'AI provider network request failed',
      undefined,
      { cause: error },
    );
  }
}
