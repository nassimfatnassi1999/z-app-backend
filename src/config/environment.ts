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
  if (config.NODE_ENV === 'production' && config.MAIL_ENABLED !== 'true') {
    throw new Error('MAIL_ENABLED must be true in production');
  }
  return config;
}
