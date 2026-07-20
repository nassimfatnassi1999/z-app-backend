import { ConfigService } from '@nestjs/config';
import { AiPipelineException } from '../ai-pipeline.error';
import { AiProviderError } from '../providers/ai-provider.error';
import {
  AiProviderName,
  EmailAiProvider,
  GeneratedEmailContent,
} from '../providers/email-ai-provider.types';
import { AiProviderRouterService } from './ai-provider-router.service';
import { InMemoryRoundRobinCounter } from './round-robin-counter.service';

const email: GeneratedEmailContent = {
  subject: 'Déploiement terminé',
  body: 'Bonjour,\n\nLe déploiement est terminé.\n\nCordialement,',
  detectedLanguage: 'fr',
  detectedTone: 'professional',
  emailType: 'information',
  confidence: 0.96,
};
const input = { transcript: 'Le déploiement est terminé.', preferences: { language: 'fr' } };

function provider(name: AiProviderName, configured = true): EmailAiProvider {
  return {
    name,
    model: `${name}-model`,
    isConfigured: jest.fn(() => configured),
    generateEmail: jest.fn().mockResolvedValue(email),
  };
}

function setup(options: { order?: string; timeout?: number; threshold?: number } = {}) {
  const groq = provider(AiProviderName.GROQ);
  const gemini = provider(AiProviderName.GEMINI);
  const openrouter = provider(AiProviderName.OPENROUTER);
  const router = new AiProviderRouterService(
    new ConfigService({
      AI_PROVIDER_ORDER: options.order ?? 'groq,gemini,openrouter',
      AI_PROVIDER_TIMEOUT_MS: String(options.timeout ?? 30_000),
      AI_PROVIDER_MAX_ATTEMPTS: '3',
      AI_CIRCUIT_BREAKER_FAILURE_THRESHOLD: String(options.threshold ?? 3),
      AI_CIRCUIT_BREAKER_COOLDOWN_MS: '60000',
    }),
    groq as never,
    gemini as never,
    openrouter as never,
    new InMemoryRoundRobinCounter(),
  );
  return { router, groq, gemini, openrouter };
}

describe('AiProviderRouterService', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('round-robins between available providers and stops on first success', async () => {
    const { router, groq, gemini, openrouter } = setup();
    await router.generateEmail(input, 'r1');
    await router.generateEmail(input, 'r2');
    await router.generateEmail(input, 'r3');
    expect(groq.generateEmail).toHaveBeenCalledTimes(1);
    expect(gemini.generateEmail).toHaveBeenCalledTimes(1);
    expect(openrouter.generateEmail).toHaveBeenCalledTimes(1);
  });

  it('falls back after Groq failure and OpenRouter timeout, then records Gemini success once', async () => {
    jest.useFakeTimers();
    const { router, groq, openrouter, gemini } = setup({
      order: 'groq,openrouter,gemini',
      timeout: 50,
    });
    jest.mocked(groq.generateEmail).mockRejectedValue(new AiProviderError('network', 'down'));
    jest.mocked(openrouter.generateEmail).mockImplementation(() => new Promise(() => undefined));

    const promise = router.generateEmail(input, 'fallback-request');
    await jest.advanceTimersByTimeAsync(51);
    await expect(promise).resolves.toMatchObject({
      email,
      provider: 'gemini',
      model: 'gemini-model',
      attempts: 3,
      fallbackReasons: ['groq:network', 'openrouter:timeout'],
    });
    expect(groq.generateEmail).toHaveBeenCalledTimes(1);
    expect(openrouter.generateEmail).toHaveBeenCalledTimes(1);
    expect(gemini.generateEmail).toHaveBeenCalledTimes(1);
  });

  it('fails over for invalid JSON, rate limit and unavailable model', async () => {
    const { router, groq, gemini } = setup();
    jest.mocked(groq.generateEmail).mockRejectedValue(new AiProviderError('invalid_json', 'bad'));
    jest.mocked(gemini.generateEmail).mockRejectedValue(new AiProviderError('http', 'rate', 429));
    await expect(router.generateEmail(input, 'r')).resolves.toMatchObject({
      provider: 'openrouter',
      attempts: 3,
    });
  });

  it('opens a temporary circuit and returns a business error when all providers fail', async () => {
    const { router, groq, gemini, openrouter } = setup({ threshold: 1 });
    for (const item of [groq, gemini, openrouter]) {
      jest.mocked(item.generateEmail).mockRejectedValue(new AiProviderError('unavailable', 'down'));
    }
    await expect(router.generateEmail(input, 'r')).rejects.toMatchObject({
      code: 'NO_AI_PROVIDER_AVAILABLE',
    });
    expect(router.getHealthState(AiProviderName.GROQ).circuitOpenUntil).not.toBeNull();
  });

  it('never logs provider secrets from thrown messages', async () => {
    const secret = 'provider-secret-value';
    const output: unknown[] = [];
    jest.spyOn(console, 'log').mockImplementation((value) => output.push(value));
    const { router, groq } = setup();
    jest
      .mocked(groq.generateEmail)
      .mockRejectedValue(new AiProviderError('authentication', secret, 401));
    await router.generateEmail(input, 'r');
    expect(JSON.stringify(output)).not.toContain(secret);
  });

  it('rejects an empty transcript before calling providers', async () => {
    const { router, groq } = setup();
    await expect(router.generateEmail({ transcript: ' ' }, 'r')).rejects.toBeInstanceOf(
      AiPipelineException,
    );
    expect(groq.generateEmail).not.toHaveBeenCalled();
  });
});
