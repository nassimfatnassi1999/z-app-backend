const INSECURE_VALUES = new Set([
  'change_me_access_secret_32_chars',
  'change_me_refresh_secret_32_chars',
  'change_me_long_random_secret',
]);

export const ENVIRONMENT_DEFAULTS = {
  DEEPGRAM_MODEL: 'nova-3',
  DEEPGRAM_LANGUAGE: 'multi',
  DEEPGRAM_DETECT_LANGUAGE: 'true',
  GROQ_PRIMARY_MODEL: 'openai/gpt-oss-120b',
  GROQ_FALLBACK_MODEL: 'llama-3.3-70b-versatile',
  GROQ_TIMEOUT_MS: '30000',
  GROQ_MAX_RETRIES: '2',
  AI_ANALYSIS_TEMPERATURE: '0.1',
  AI_GENERATION_TEMPERATURE: '0.25',
  AI_MAX_COMPLETION_TOKENS: '1200',
  GROQ_BASE_URL: 'https://api.groq.com/openai/v1',
  GROQ_ANALYSIS_MODEL: 'openai/gpt-oss-120b',
  GROQ_GENERATION_MODEL: 'openai/gpt-oss-120b',
  AI_REPAIR_TEMPERATURE: '0.1',
  AI_ENABLE_REPAIR: 'true',
  AI_EMAIL_PROMPT_VERSION: 'v2',
  DEEPGRAM_BASE_URL: 'https://api.deepgram.com/v1',
  DEEPGRAM_LANGUAGE_STRATEGY: 'auto',
  DEEPGRAM_DEFAULT_LANGUAGE: 'multi',
  DEEPGRAM_TIMEOUT_MS: '15000',
  DEEPGRAM_MAX_RETRIES: '1',
  DEEPGRAM_ENABLE_LANGUAGE_RETRY: 'false',
  MAX_AUDIO_SIZE_BYTES: '12582912',
  MIN_AUDIO_DURATION_MS: '500',
  MAX_AUDIO_DURATION_SECONDS: '600',
} as const;

import { parseBoundedNumber, parseHttpUrl, parseStrictBoolean } from './runtime-config';

const LEGACY_ALIASES: Record<string, string[]> = {
  GROQ_PRIMARY_MODEL: ['GROQ_MODEL'],
  GROQ_ANALYSIS_MODEL: ['GROQ_PRIMARY_MODEL', 'GROQ_MODEL'],
  GROQ_GENERATION_MODEL: ['GROQ_PRIMARY_MODEL', 'GROQ_MODEL'],
  DEEPGRAM_MODEL: ['DEEPGRAM_TRANSCRIPTION_MODEL'],
  DEEPGRAM_LANGUAGE: ['DEEPGRAM_DEFAULT_LANGUAGE'],
  DEEPGRAM_DETECT_LANGUAGE: ['DEEPGRAM_AUTO_DETECT_LANGUAGE'],
  JWT_ACCESS_SECRET: ['JWT_SECRET'],
};

function applyDefaultsAndAliases(config: Record<string, unknown>) {
  for (const [name, aliases] of Object.entries(LEGACY_ALIASES)) {
    if (config[name] !== undefined && config[name] !== null) continue;
    const legacyValue = aliases
      .map((alias) => config[alias])
      .find((value) => String(value ?? '').trim());
    if (legacyValue !== undefined) config[name] = legacyValue;
  }
  for (const [name, value] of Object.entries(ENVIRONMENT_DEFAULTS)) {
    if (config[name] === undefined || config[name] === null) config[name] = value;
  }
}

function requiredSecret(config: Record<string, unknown>, name: string, minimumLength = 32) {
  const value = String(config[name] ?? '').trim();
  if (
    !value ||
    value.length < minimumLength ||
    INSECURE_VALUES.has(value) ||
    value.startsWith('generate_')
  ) {
    throw new Error(
      `${name} must be configured with a unique secret of at least ${minimumLength} characters`,
    );
  }
}

export function validateEnvironment(config: Record<string, unknown>) {
  applyDefaultsAndAliases(config);
  requiredSecret(config, 'JWT_ACCESS_SECRET');
  requiredSecret(config, 'JWT_REFRESH_SECRET');
  requiredSecret(config, 'EMAIL_CODE_SECRET');
  const secrets = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'EMAIL_CODE_SECRET'].map((name) =>
    String(config[name]),
  );
  if (new Set(secrets).size !== secrets.length) {
    throw new Error('JWT and email code secrets must be different');
  }

  if (!String(config.DATABASE_URL ?? '').trim()) {
    throw new Error('DATABASE_URL is required');
  }
  for (const name of ['DEEPGRAM_API_KEY', 'GROQ_API_KEY']) {
    if (!String(config[name] ?? '').trim()) throw new Error(`${name} is required`);
  }
  const nonEmpty = [
    'DEEPGRAM_MODEL',
    'GROQ_ANALYSIS_MODEL',
    'GROQ_GENERATION_MODEL',
    'GROQ_FALLBACK_MODEL',
  ];
  for (const name of nonEmpty) {
    if (!String(config[name] ?? '').trim()) throw new Error(`${name} must not be empty`);
  }
  const nodeEnvironment = String(config.NODE_ENV ?? 'development');
  if (!['development', 'test', 'production'].includes(nodeEnvironment)) {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  parseBoundedNumber(config.PORT ?? '3000', 'PORT', { min: 1, max: 65535, integer: true });
  parseHttpUrl(config.GROQ_BASE_URL, 'GROQ_BASE_URL');
  parseHttpUrl(config.DEEPGRAM_BASE_URL, 'DEEPGRAM_BASE_URL');
  for (const name of ['AI_ENABLE_REPAIR', 'DEEPGRAM_ENABLE_LANGUAGE_RETRY']) {
    parseStrictBoolean(config[name], name);
  }
  if (!['auto', 'forced'].includes(String(config.DEEPGRAM_LANGUAGE_STRATEGY))) {
    throw new Error('DEEPGRAM_LANGUAGE_STRATEGY must be auto or forced');
  }
  if (!['v1', 'v2'].includes(String(config.AI_EMAIL_PROMPT_VERSION))) {
    throw new Error('AI_EMAIL_PROMPT_VERSION must be v1 or v2');
  }
  for (const name of ['GROQ_MAX_RETRIES', 'DEEPGRAM_MAX_RETRIES']) {
    parseBoundedNumber(config[name], name, { min: 0, max: 5, integer: true });
  }
  for (const name of ['GROQ_TIMEOUT_MS', 'DEEPGRAM_TIMEOUT_MS']) {
    parseBoundedNumber(config[name], name, { min: 1, max: 120000, integer: true });
  }
  for (const name of [
    'AI_ANALYSIS_TEMPERATURE',
    'AI_GENERATION_TEMPERATURE',
    'AI_REPAIR_TEMPERATURE',
  ]) {
    parseBoundedNumber(config[name], name, { min: 0, max: 2 });
  }
  parseBoundedNumber(config.AI_MAX_COMPLETION_TOKENS, 'AI_MAX_COMPLETION_TOKENS', {
    min: 1,
    max: 32768,
    integer: true,
  });
  parseBoundedNumber(config.MAX_AUDIO_SIZE_BYTES, 'MAX_AUDIO_SIZE_BYTES', {
    min: 1024,
    max: 100 * 1024 * 1024,
    integer: true,
  });
  const minDuration = parseBoundedNumber(config.MIN_AUDIO_DURATION_MS, 'MIN_AUDIO_DURATION_MS', {
    min: 1,
    max: 60000,
    integer: true,
  });
  const maxDurationSeconds = parseBoundedNumber(
    config.MAX_AUDIO_DURATION_SECONDS,
    'MAX_AUDIO_DURATION_SECONDS',
    { min: 1, max: 3600, integer: true },
  );
  if (minDuration >= maxDurationSeconds * 1000) {
    throw new Error('MIN_AUDIO_DURATION_MS must be less than MAX_AUDIO_DURATION_SECONDS');
  }
  if (config.NODE_ENV === 'production' && config.MAIL_ENABLED !== 'true') {
    throw new Error('MAIL_ENABLED must be true in production');
  }
  return config;
}
