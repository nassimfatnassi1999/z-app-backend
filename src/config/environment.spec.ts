import { validateEnvironment } from './environment';

const valid = {
  DATABASE_URL: 'postgresql://localhost/z',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  EMAIL_CODE_SECRET: 'c'.repeat(32),
  NODE_ENV: 'test',
  DEEPGRAM_API_KEY: 'deepgram-test-key',
  DEEPGRAM_MODEL: 'nova-3',
  GROQ_API_KEY: 'groq-test-key',
  GROQ_PRIMARY_MODEL: 'openai/gpt-oss-120b',
  GROQ_FALLBACK_MODEL: 'llama-3.3-70b-versatile',
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

  it.each([
    'DEEPGRAM_API_KEY',
    'DEEPGRAM_MODEL',
    'GROQ_API_KEY',
    'GROQ_PRIMARY_MODEL',
    'GROQ_FALLBACK_MODEL',
  ])('rejects a missing AI setting %s', (name) =>
    expect(() => validateEnvironment({ ...valid, [name]: '' })).toThrow(name),
  );
});
