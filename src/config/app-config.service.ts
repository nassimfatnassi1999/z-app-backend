import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ENVIRONMENT_DEFAULTS } from './environment';

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
}
