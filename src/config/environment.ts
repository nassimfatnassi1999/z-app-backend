const INSECURE_VALUES = new Set([
  'change_me_access_secret_32_chars',
  'change_me_refresh_secret_32_chars',
  'change_me_long_random_secret',
]);

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
  const aiRequired = [
    'GROQ_API_KEY',
    'GROQ_BASE_URL',
    'GROQ_EMAIL_MODEL',
    'GROQ_EXTRACTION_MODEL',
    'GROQ_VALIDATION_MODEL',
  ];
  for (const name of aiRequired) {
    if (!String(config[name] ?? '').trim()) throw new Error(`${name} is required`);
  }
  const timeout = Number(config.AI_REQUEST_TIMEOUT_MS);
  if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 120_000) {
    throw new Error('AI_REQUEST_TIMEOUT_MS must be between 1000 and 120000');
  }
  if (String(config.AI_MAX_REPAIR_ATTEMPTS) !== '1') {
    throw new Error('AI_MAX_REPAIR_ATTEMPTS must be 1');
  }
  const groqTimeout = Number(config.GROQ_TIMEOUT_MS ?? 30_000);
  if (!Number.isInteger(groqTimeout) || groqTimeout < 1_000 || groqTimeout > 120_000) {
    throw new Error('GROQ_TIMEOUT_MS must be between 1000 and 120000');
  }
  const maxTokens = Number(config.GROQ_MAX_TOKENS ?? 1200);
  if (!Number.isInteger(maxTokens) || maxTokens < 256 || maxTokens > 8192) {
    throw new Error('GROQ_MAX_TOKENS must be between 256 and 8192');
  }
  const temperature = Number(config.GROQ_TEMPERATURE ?? 0.35);
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) {
    throw new Error('GROQ_TEMPERATURE must be between 0 and 1');
  }
  if (config.NODE_ENV === 'production' && config.MAIL_ENABLED !== 'true') {
    throw new Error('MAIL_ENABLED must be true in production');
  }
  return config;
}
