const INSECURE_VALUES = new Set([
  'change_me_access_secret_32_chars',
  'change_me_refresh_secret_32_chars',
  'change_me_long_random_secret',
]);

// Shared non-secret defaults used by the typed configuration facade.
export const ENVIRONMENT_DEFAULTS = {
  DEEPGRAM_MODEL: 'nova-3',
  DEEPGRAM_LANGUAGE: 'multi',
  DEEPGRAM_DETECT_LANGUAGE: 'true',
} as const;

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
  const supportedProviders = new Set(['groq', 'gemini', 'openrouter']);
  const providerOrder = String(config.AI_PROVIDER_ORDER ?? 'groq,gemini,openrouter')
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean);
  if (
    !providerOrder.length ||
    providerOrder.some((provider) => !supportedProviders.has(provider))
  ) {
    throw new Error('AI_PROVIDER_ORDER must contain only groq, gemini and openrouter');
  }
  const configuredProviders: Record<string, boolean> = {
    groq: Boolean(
      String(config.GROQ_API_KEY ?? '').trim() &&
      String(config.GROQ_MODEL ?? config.GROQ_EMAIL_MODEL ?? '').trim(),
    ),
    gemini: Boolean(
      String(config.GEMINI_API_KEY ?? '').trim() && String(config.GEMINI_MODEL ?? '').trim(),
    ),
    openrouter: Boolean(
      String(config.OPENROUTER_API_KEY ?? '').trim() &&
      String(config.OPENROUTER_MODEL ?? '').trim(),
    ),
  };
  if (!providerOrder.some((provider) => configuredProviders[provider])) {
    throw new Error('At least one AI provider and model must be configured');
  }
  validateInteger(config, 'AI_PROVIDER_TIMEOUT_MS', 30_000, 1_000, 120_000);
  validateInteger(config, 'AI_MAX_TRANSCRIPT_CHARS', 20_000, 100, 100_000);
  validateInteger(config, 'AI_PROVIDER_MAX_ATTEMPTS', 3, 1, 3);
  validateInteger(config, 'AI_CIRCUIT_BREAKER_FAILURE_THRESHOLD', 3, 1, 100);
  validateInteger(config, 'AI_CIRCUIT_BREAKER_COOLDOWN_MS', 60_000, 1_000, 3_600_000);
  if (config.NODE_ENV === 'production' && config.MAIL_ENABLED !== 'true') {
    throw new Error('MAIL_ENABLED must be true in production');
  }
  return config;
}

function validateInteger(
  config: Record<string, unknown>,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const value = Number(config[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
}
