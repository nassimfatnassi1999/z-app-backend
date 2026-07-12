import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ENVIRONMENT_DEFAULTS } from './environment';
import { AiRuntimeConfig, parseStrictBoolean } from './runtime-config';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  get nodeEnvironment() {
    return this.config.get<string>('NODE_ENV', 'development');
  }

  get port() {
    return this.config.get<number>('PORT', 3000);
  }

  get deepgramApiKey() {
    return this.config.get<string>('DEEPGRAM_API_KEY', '').trim();
  }

  get deepgramModel() {
    return this.config.get<string>('DEEPGRAM_MODEL', ENVIRONMENT_DEFAULTS.DEEPGRAM_MODEL).trim();
  }

  get deepgramLanguage() {
    return this.config
      .get<string>('DEEPGRAM_LANGUAGE', ENVIRONMENT_DEFAULTS.DEEPGRAM_LANGUAGE)
      .trim();
  }

  get deepgramDetectLanguage() {
    return (
      this.config.get<string>(
        'DEEPGRAM_DETECT_LANGUAGE',
        ENVIRONMENT_DEFAULTS.DEEPGRAM_DETECT_LANGUAGE,
      ) !== 'false'
    );
  }

  get groqApiKey() {
    return this.config.get<string>('GROQ_API_KEY', '').trim();
  }

  get groqPrimaryModel() {
    return this.config
      .get<string>('GROQ_PRIMARY_MODEL', ENVIRONMENT_DEFAULTS.GROQ_PRIMARY_MODEL)
      .trim();
  }

  get groqFallbackModel() {
    return this.config
      .get<string>('GROQ_FALLBACK_MODEL', ENVIRONMENT_DEFAULTS.GROQ_FALLBACK_MODEL)
      .trim();
  }

  get corsOrigins() {
    return this.config.get<string>('CORS_ORIGINS', '');
  }

  get swaggerEnabled() {
    return this.config.get<string>('SWAGGER_ENABLED') === 'true';
  }

  get aiRuntime(): Readonly<AiRuntimeConfig> {
    const value: AiRuntimeConfig = {
      groq: {
        baseUrl: this.config.getOrThrow<string>('GROQ_BASE_URL'),
        analysisModel: this.config.getOrThrow<string>('GROQ_ANALYSIS_MODEL'),
        generationModel: this.config.getOrThrow<string>('GROQ_GENERATION_MODEL'),
        fallbackModel: this.config.get<string>('GROQ_FALLBACK_MODEL') || undefined,
        timeoutMs: Number(this.config.getOrThrow<string>('GROQ_TIMEOUT_MS')),
        maxRetries: Number(this.config.getOrThrow<string>('GROQ_MAX_RETRIES')),
        analysisTemperature: Number(this.config.getOrThrow<string>('AI_ANALYSIS_TEMPERATURE')),
        generationTemperature: Number(this.config.getOrThrow<string>('AI_GENERATION_TEMPERATURE')),
        repairTemperature: Number(this.config.getOrThrow<string>('AI_REPAIR_TEMPERATURE')),
        maxOutputTokens: Number(this.config.getOrThrow<string>('AI_MAX_COMPLETION_TOKENS')),
        enableRepair: parseStrictBoolean(this.config.getOrThrow<string>('AI_ENABLE_REPAIR')),
      },
      deepgram: {
        baseUrl: this.config.getOrThrow<string>('DEEPGRAM_BASE_URL'),
        model: this.config.getOrThrow<string>('DEEPGRAM_MODEL'),
        languageStrategy: this.config.getOrThrow<'auto' | 'forced'>('DEEPGRAM_LANGUAGE_STRATEGY'),
        defaultLanguage: this.config.get<string>('DEEPGRAM_DEFAULT_LANGUAGE') || undefined,
        timeoutMs: Number(this.config.getOrThrow<string>('DEEPGRAM_TIMEOUT_MS')),
        maxRetries: Number(this.config.getOrThrow<string>('DEEPGRAM_MAX_RETRIES')),
        enableLanguageRetry: parseStrictBoolean(
          this.config.getOrThrow<string>('DEEPGRAM_ENABLE_LANGUAGE_RETRY'),
        ),
        maxAudioSizeBytes: Number(this.config.getOrThrow<string>('MAX_AUDIO_SIZE_BYTES')),
        minAudioDurationMs: Number(this.config.getOrThrow<string>('MIN_AUDIO_DURATION_MS')),
        maxAudioDurationSeconds: Number(
          this.config.getOrThrow<string>('MAX_AUDIO_DURATION_SECONDS'),
        ),
      },
    };
    return Object.freeze(value);
  }
}
