import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiResponseParserService } from '../services/ai-response-parser.service';
import { AiProviderName, EmailAiProvider } from './email-ai-provider.types';
import { OpenAiCompatibleEmailProvider } from './openai-compatible-email.provider';

@Injectable()
export class OpenRouterEmailAiProvider
  extends OpenAiCompatibleEmailProvider
  implements EmailAiProvider
{
  readonly name = AiProviderName.OPENROUTER;
  readonly model: string;
  protected readonly apiKey: string;
  protected readonly baseUrl: string;
  protected readonly temperature: number;
  protected readonly maxTokens: number;
  protected readonly timeoutMs: number;
  protected readonly defaultHeaders: Record<string, string>;

  constructor(config: ConfigService, parser: AiResponseParserService) {
    super(parser);
    this.apiKey = config.get<string>('OPENROUTER_API_KEY')?.trim() ?? '';
    this.baseUrl = config.get<string>('OPENROUTER_BASE_URL') ?? 'https://openrouter.ai/api/v1';
    this.model = config.get<string>('OPENROUTER_MODEL')?.trim() ?? '';
    this.temperature = Number(config.get<string>('OPENROUTER_TEMPERATURE') ?? 0.35);
    this.maxTokens = Number(config.get<string>('OPENROUTER_MAX_TOKENS') ?? 1200);
    this.timeoutMs = Number(config.get<string>('AI_PROVIDER_TIMEOUT_MS') ?? 30_000);
    const referer = config.get<string>('OPENROUTER_HTTP_REFERER')?.trim();
    const appName = config.get<string>('OPENROUTER_APP_NAME')?.trim() || 'Z';
    this.defaultHeaders = {
      ...(referer ? { 'HTTP-Referer': referer } : {}),
      'X-Title': appName,
    };
  }
}
