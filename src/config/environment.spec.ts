import { validateEnvironment } from './environment';

const valid = {
  DATABASE_URL: 'postgresql://localhost/z',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  EMAIL_CODE_SECRET: 'c'.repeat(32),
  NODE_ENV: 'test',
  DEEPGRAM_API_KEY: 'deepgram-test-key',
  GROQ_API_KEY: 'groq-test-key',
};

describe('validateEnvironment', () => {
  it('accepts unique non-default secrets', () => {
    expect(validateEnvironment({ ...valid })).toMatchObject(valid);
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

  it.each(['DEEPGRAM_API_KEY', 'GROQ_API_KEY'])('rejects a missing AI setting %s', (name) =>
    expect(() => validateEnvironment({ ...valid, [name]: '' })).toThrow(name),
  );

  it('applies safe defaults when optional AI settings are absent', () => {
    expect(validateEnvironment({ ...valid })).toMatchObject({
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
    });
  });

  it('maps the legacy GROQ_MODEL setting to the primary model', () => {
    expect(validateEnvironment({ ...valid, GROQ_MODEL: 'legacy-model' })).toMatchObject({
      GROQ_PRIMARY_MODEL: 'legacy-model',
    });
  });
});
