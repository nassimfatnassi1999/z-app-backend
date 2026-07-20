import { GoogleGenAI } from '@google/genai';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiResponseParserService } from '../services/ai-response-parser.service';
import { AiProviderError } from './ai-provider.error';
import {
  AiProviderName,
  EmailAiProvider,
  EmailGenerationInput,
  GeneratedEmailContent,
} from './email-ai-provider.types';
import { emailProviderPrompt } from './email-provider-prompt';

@Injectable()
export class GeminiEmailAiProvider implements EmailAiProvider {
  readonly name = AiProviderName.GEMINI;
  readonly model: string;
  private readonly apiKey: string;
  private readonly temperature: number;
  private readonly maxOutputTokens: number;

  constructor(
    config: ConfigService,
    private readonly parser: AiResponseParserService,
  ) {
    this.apiKey = config.get<string>('GEMINI_API_KEY')?.trim() ?? '';
    this.model = config.get<string>('GEMINI_MODEL')?.trim() ?? '';
    this.temperature = Number(config.get<string>('GEMINI_TEMPERATURE') ?? 0.35);
    this.maxOutputTokens = Number(config.get<string>('GEMINI_MAX_OUTPUT_TOKENS') ?? 1200);
  }

  isConfigured() {
    return Boolean(this.apiKey && this.model);
  }

  async generateEmail(
    input: EmailGenerationInput,
    signal?: AbortSignal,
  ): Promise<GeneratedEmailContent> {
    try {
      if (signal?.aborted) throw new AiProviderError('timeout', 'AI provider request timed out');
      const client = new GoogleGenAI({ apiKey: this.apiKey });
      const prompt = emailProviderPrompt(input);
      const response = await client.models.generateContent({
        model: this.model,
        contents: prompt.user,
        config: {
          abortSignal: signal,
          systemInstruction: prompt.system,
          temperature: input.mode === 'repair' ? 0.1 : this.temperature,
          maxOutputTokens: this.maxOutputTokens,
          responseMimeType: 'application/json',
        },
      });
      return this.parser.parse(response.text ?? '');
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      const status = this.statusOf(error);
      if (status === 401 || status === 403) {
        throw new AiProviderError('authentication', 'Invalid Gemini configuration', status, {
          cause: error,
        });
      }
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (status === 404 || message.includes('model unavailable')) {
        throw new AiProviderError('unavailable', 'Gemini model is unavailable', status, {
          cause: error,
        });
      }
      if (status) {
        throw new AiProviderError('http', `Gemini HTTP ${status}`, status, { cause: error });
      }
      throw new AiProviderError(
        message.includes('timeout') || message.includes('abort') ? 'timeout' : 'network',
        'Gemini request failed',
        undefined,
        { cause: error },
      );
    }
  }

  private statusOf(error: unknown) {
    if (typeof error !== 'object' || error === null) return undefined;
    const candidate = error as { status?: unknown; code?: unknown };
    const status = Number(candidate.status ?? candidate.code);
    return Number.isInteger(status) && status >= 100 ? status : undefined;
  }
}
