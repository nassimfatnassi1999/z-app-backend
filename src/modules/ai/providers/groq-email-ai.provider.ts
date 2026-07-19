import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiResponseParserService } from '../services/ai-response-parser.service';
import { AiProviderName, EmailAiProvider } from './email-ai-provider.types';
import { OpenAiCompatibleEmailProvider } from './openai-compatible-email.provider';

@Injectable()
export class GroqEmailAiProvider extends OpenAiCompatibleEmailProvider implements EmailAiProvider {
  readonly name = AiProviderName.GROQ;
  readonly model: string;
  protected readonly apiKey: string;
  protected readonly baseUrl: string;
  protected readonly temperature: number;
  protected readonly maxTokens: number;
  protected readonly timeoutMs: number;
  protected readonly defaultHeaders = {};

  constructor(config: ConfigService, parser: AiResponseParserService) {
    super(parser);
    this.apiKey = config.get<string>('GROQ_API_KEY')?.trim() ?? '';
    this.baseUrl = config.get<string>('GROQ_BASE_URL') ?? 'https://api.groq.com/openai/v1';
    this.model =
      config.get<string>('GROQ_MODEL')?.trim() ||
      config.get<string>('GROQ_EMAIL_MODEL')?.trim() ||
      '';
    this.temperature = Number(config.get<string>('GROQ_TEMPERATURE') ?? 0.35);
    this.maxTokens = Number(config.get<string>('GROQ_MAX_TOKENS') ?? 1200);
    this.timeoutMs = Number(config.get<string>('AI_PROVIDER_TIMEOUT_MS') ?? 30_000);
  }
}
