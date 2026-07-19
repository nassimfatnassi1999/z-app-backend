import { validateEnvironment } from './environment';

const valid = {
  DATABASE_URL: 'postgresql://localhost/z',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  EMAIL_CODE_SECRET: 'c'.repeat(32),
  NODE_ENV: 'test',
  GROQ_API_KEY: 'test-key',
  GROQ_BASE_URL: 'https://api.groq.com/openai/v1',
  GROQ_EMAIL_MODEL: 'test-model',
  GROQ_EXTRACTION_MODEL: 'test-model',
  GROQ_VALIDATION_MODEL: 'test-model',
  AI_PROVIDER_ORDER: 'groq,gemini,openrouter',
  AI_PROVIDER_TIMEOUT_MS: '30000',
  AI_PROVIDER_MAX_ATTEMPTS: '3',
  AI_CIRCUIT_BREAKER_FAILURE_THRESHOLD: '3',
  AI_CIRCUIT_BREAKER_COOLDOWN_MS: '60000',
  AI_REQUEST_TIMEOUT_MS: '30000',
  AI_MAX_REPAIR_ATTEMPTS: '1',
};

describe('validateEnvironment', () => {
  it('accepts unique non-default secrets', () => {
    expect(validateEnvironment({ ...valid })).toEqual(valid);
  });

  it.each(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'EMAIL_CODE_SECRET'])(
    'rejects a missing or weak %s',
    (name) => {
      expect(() => validateEnvironment({ ...valid, [name]: 'too-short' })).toThrow(name);
    },
  );

  it('rejects disabled mail in production', () => {
    expect(() =>
      validateEnvironment({ ...valid, NODE_ENV: 'production', MAIL_ENABLED: 'false' }),
    ).toThrow('MAIL_ENABLED');
  });

  it('rejects reused secrets', () => {
    expect(() => validateEnvironment({ ...valid, JWT_REFRESH_SECRET: 'a'.repeat(32) })).toThrow(
      'must be different',
    );
  });

  it('accepts Gemini as the only configured provider', () => {
    expect(() =>
      validateEnvironment({
        ...valid,
        GROQ_API_KEY: '',
        GEMINI_API_KEY: 'gemini-key',
        GEMINI_MODEL: 'gemini-model',
      }),
    ).not.toThrow();
  });

  it('rejects unsupported provider order values', () => {
    expect(() => validateEnvironment({ ...valid, AI_PROVIDER_ORDER: 'groq,unknown' })).toThrow(
      'AI_PROVIDER_ORDER',
    );
  });

  it('rejects an order with no configured provider', () => {
    expect(() => validateEnvironment({ ...valid, AI_PROVIDER_ORDER: 'gemini' })).toThrow(
      'At least one AI provider',
    );
  });
});
