import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProviderError } from '../providers/ai-provider.error';
import {
  AiProviderName,
  EmailAiProvider,
  GeneratedEmail,
} from '../providers/email-ai-provider.types';
import { AiProviderRouterService } from './ai-provider-router.service';
import { InMemoryRoundRobinCounter } from './round-robin-counter.service';

const email: GeneratedEmail = {
  subject: 'Sujet',
  body: 'Corps du message valide.',
  detectedLanguage: 'fr',
  detectedRecipientType: 'person',
  detectedRelationship: 'professional',
  detectedTone: 'professional',
  emailIntent: 'inform',
  emailComplexity: 'simple',
  confidence: 0.98,
  validationWarnings: [],
};

const input = {
  transcript: 'Écrivez un message professionnel.',
  extraction: {
    language: 'fr',
    intent: 'inform',
    recipient: null,
    facts: [],
    constraints: [],
    requestedActions: [],
    dates: [],
    amounts: [],
    names: [],
    keywords: [],
    transcriptionCorrections: [],
    tone: 'professional',
    ambiguities: [],
    needsClarification: false,
    clarificationQuestions: [],
  },
};

function mockProvider(name: AiProviderName, configured = true): EmailAiProvider {
  return {
    name,
    model: `${name}-model`,
    isConfigured: jest.fn(() => configured),
    generateEmail: jest.fn().mockResolvedValue(email),
  };
}

function setup(
  options: {
    order?: string;
    configured?: Partial<Record<AiProviderName, boolean>>;
    timeout?: number;
    threshold?: number;
    cooldown?: number;
    maxAttempts?: number;
  } = {},
) {
  const groq = mockProvider(AiProviderName.GROQ, options.configured?.groq ?? true);
  const gemini = mockProvider(AiProviderName.GEMINI, options.configured?.gemini ?? true);
  const openrouter = mockProvider(
    AiProviderName.OPENROUTER,
    options.configured?.openrouter ?? true,
  );
  const config = new ConfigService({
    AI_PROVIDER_ORDER: options.order ?? 'groq,gemini,openrouter',
    AI_PROVIDER_TIMEOUT_MS: String(options.timeout ?? 30_000),
    AI_PROVIDER_MAX_ATTEMPTS: String(options.maxAttempts ?? 3),
    AI_CIRCUIT_BREAKER_FAILURE_THRESHOLD: String(options.threshold ?? 3),
    AI_CIRCUIT_BREAKER_COOLDOWN_MS: String(options.cooldown ?? 60_000),
  });
  const router = new AiProviderRouterService(
    config,
    groq as never,
    gemini as never,
    openrouter as never,
    new InMemoryRoundRobinCounter(),
  );
  return { router, groq, gemini, openrouter };
}

function fail(provider: EmailAiProvider, error: unknown) {
  jest.mocked(provider.generateEmail).mockRejectedValue(error);
}

describe('AiProviderRouterService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('rotates Groq, Gemini, OpenRouter and returns to Groq', async () => {
    const { router, groq, gemini, openrouter } = setup();
    await router.generateEmail(input);
    await router.generateEmail(input);
    await router.generateEmail(input);
    await router.generateEmail(input);
    expect(groq.generateEmail).toHaveBeenCalledTimes(2);
    expect(gemini.generateEmail).toHaveBeenCalledTimes(1);
    expect(openrouter.generateEmail).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Groq to Gemini', AiProviderName.GROQ, AiProviderName.GEMINI],
    ['Gemini to OpenRouter', AiProviderName.GEMINI, AiProviderName.OPENROUTER],
  ])('fails over from %s', async (_label, first, second) => {
    const { router, groq, gemini, openrouter } = setup({
      order: `${first},${second}`,
      configured: {
        [AiProviderName.GROQ]: first === AiProviderName.GROQ || second === AiProviderName.GROQ,
        [AiProviderName.GEMINI]:
          first === AiProviderName.GEMINI || second === AiProviderName.GEMINI,
        [AiProviderName.OPENROUTER]:
          first === AiProviderName.OPENROUTER || second === AiProviderName.OPENROUTER,
      },
    });
    const providers = { groq, gemini, openrouter };
    fail(providers[first], new AiProviderError('network', 'down'));
    await expect(router.generateEmail(input)).resolves.toEqual(email);
    expect(providers[first].generateEmail).toHaveBeenCalledTimes(1);
    expect(providers[second].generateEmail).toHaveBeenCalledTimes(1);
  });

  it('uses the third provider after two failures without duplicate calls', async () => {
    const { router, groq, gemini, openrouter } = setup();
    fail(groq, new AiProviderError('http', 'busy', 500));
    fail(gemini, new AiProviderError('invalid_json', 'invalid'));
    await expect(router.generateEmail(input)).resolves.toEqual(email);
    expect(groq.generateEmail).toHaveBeenCalledTimes(1);
    expect(gemini.generateEmail).toHaveBeenCalledTimes(1);
    expect(openrouter.generateEmail).toHaveBeenCalledTimes(1);
  });

  it('returns service unavailable when every provider fails', async () => {
    const { router, groq, gemini, openrouter } = setup();
    for (const provider of [groq, gemini, openrouter]) {
      fail(provider, new AiProviderError('unavailable', 'down'));
    }
    await expect(router.generateEmail(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('ignores providers that are not configured', async () => {
    const { router, groq, gemini } = setup({ configured: { groq: false } });
    await router.generateEmail(input);
    expect(groq.generateEmail).not.toHaveBeenCalled();
    expect(gemini.generateEmail).toHaveBeenCalledTimes(1);
  });

  it('rejects when no provider is configured', async () => {
    const { router } = setup({ configured: { groq: false, gemini: false, openrouter: false } });
    expect(() => router.onModuleInit()).toThrow('At least one AI');
    await expect(router.generateEmail(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it.each([429, 500])('fails over for HTTP %i', async (status) => {
    const { router, groq, gemini } = setup();
    fail(groq, new AiProviderError('http', 'provider error', status));
    await router.generateEmail(input);
    expect(gemini.generateEmail).toHaveBeenCalledTimes(1);
  });

  it('fails over when a provider model is unavailable', async () => {
    const { router, groq, gemini } = setup();
    fail(groq, new AiProviderError('unavailable', 'model unavailable', 404));
    await router.generateEmail(input);
    expect(gemini.generateEmail).toHaveBeenCalledTimes(1);
  });

  it('does not call any provider for invalid input DTO data', async () => {
    const { router, groq, gemini, openrouter } = setup();
    await expect(router.generateEmail({ ...input, transcript: ' ' })).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(groq.generateEmail).not.toHaveBeenCalled();
    expect(gemini.generateEmail).not.toHaveBeenCalled();
    expect(openrouter.generateEmail).not.toHaveBeenCalled();
  });

  it('fails over after an explicit timeout', async () => {
    jest.useFakeTimers();
    const { router, groq, gemini } = setup({ timeout: 50 });
    jest.mocked(groq.generateEmail).mockImplementation(() => new Promise(() => undefined));
    const result = router.generateEmail(input);
    await jest.advanceTimersByTimeAsync(51);
    await expect(result).resolves.toEqual(email);
    expect(gemini.generateEmail).toHaveBeenCalledTimes(1);
  });

  it('opens the circuit after three failures and skips it during cooldown', async () => {
    const { router, groq } = setup({
      order: 'groq',
      configured: { gemini: false, openrouter: false },
    });
    fail(groq, new AiProviderError('network', 'down'));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(router.generateEmail(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
    }
    expect(router.getHealthState(AiProviderName.GROQ).circuitOpenUntil).not.toBeNull();
    await expect(router.generateEmail(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(groq.generateEmail).toHaveBeenCalledTimes(3);
  });

  it('reuses a provider after cooldown and resets failures on success', async () => {
    jest.useFakeTimers({ now: new Date('2026-07-19T00:00:00Z') });
    const { router, groq } = setup({
      order: 'groq',
      configured: { gemini: false, openrouter: false },
      threshold: 1,
      cooldown: 1000,
    });
    fail(groq, new AiProviderError('network', 'down'));
    await expect(router.generateEmail(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
    jest.mocked(groq.generateEmail).mockResolvedValue(email);
    jest.advanceTimersByTime(1001);
    await expect(router.generateEmail(input)).resolves.toEqual(email);
    expect(router.getHealthState(AiProviderName.GROQ)).toMatchObject({
      consecutiveFailures: 0,
      circuitOpenUntil: null,
    });
  });

  it('honors custom provider order', async () => {
    const { router, openrouter } = setup({ order: 'openrouter,groq,gemini' });
    await router.generateEmail(input);
    expect(openrouter.generateEmail).toHaveBeenCalledTimes(1);
  });

  it('never writes API keys contained in provider errors to logs', async () => {
    const secret = 'super-secret-api-key';
    const logs: unknown[][] = [];
    jest.spyOn(Logger.prototype, 'log').mockImplementation((...args) => void logs.push(args));
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((...args) => void logs.push(args));
    jest.spyOn(Logger.prototype, 'error').mockImplementation((...args) => void logs.push(args));
    const { router, groq } = setup();
    fail(groq, new AiProviderError('authentication', secret, 401));
    await router.generateEmail(input);
    expect(JSON.stringify(logs)).not.toContain(secret);
  });
});
