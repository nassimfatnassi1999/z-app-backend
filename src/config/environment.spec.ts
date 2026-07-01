import { validateEnvironment } from './environment';

const valid = {
  DATABASE_URL: 'postgresql://localhost/z',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  EMAIL_CODE_SECRET: 'c'.repeat(32),
  NODE_ENV: 'test',
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
});
