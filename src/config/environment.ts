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
} as const;

const LEGACY_ALIASES: Record<string, string[]> = {
  GROQ_PRIMARY_MODEL: ['GROQ_MODEL'],
  DEEPGRAM_MODEL: ['DEEPGRAM_TRANSCRIPTION_MODEL'],
  DEEPGRAM_LANGUAGE: ['DEEPGRAM_DEFAULT_LANGUAGE'],
  DEEPGRAM_DETECT_LANGUAGE: ['DEEPGRAM_AUTO_DETECT_LANGUAGE'],
  JWT_ACCESS_SECRET: ['JWT_SECRET'],
};

function applyDefaultsAndAliases(config: Record<string, unknown>) {
  for (const [name, aliases] of Object.entries(LEGACY_ALIASES)) {
    if (String(config[name] ?? '').trim()) continue;
    const legacyValue = aliases
      .map((alias) => config[alias])
      .find((value) => String(value ?? '').trim());
    if (legacyValue !== undefined) config[name] = legacyValue;
  }
  for (const [name, value] of Object.entries(ENVIRONMENT_DEFAULTS)) {
    if (!String(config[name] ?? '').trim()) config[name] = value;
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
  if (config.NODE_ENV === 'production' && config.MAIL_ENABLED !== 'true') {
    throw new Error('MAIL_ENABLED must be true in production');
  }
  return config;
}
