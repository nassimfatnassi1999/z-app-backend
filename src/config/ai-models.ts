import { ConfigService } from '@nestjs/config';

export const DEFAULT_GROQ_PRIMARY_MODEL = 'openai/gpt-oss-120b';
export const DEFAULT_GROQ_FALLBACK_MODEL = 'llama-3.3-70b-versatile';
export const DEFAULT_DEEPGRAM_MODEL = 'nova-3';

export function resolveGroqModels(config: ConfigService) {
  return {
    primary:
      config.get<string>('GROQ_PRIMARY_MODEL')?.trim() ||
      config.get<string>('GROQ_MODEL')?.trim() ||
      DEFAULT_GROQ_PRIMARY_MODEL,
    fallback: config.get<string>('GROQ_FALLBACK_MODEL')?.trim() || DEFAULT_GROQ_FALLBACK_MODEL,
  };
}
