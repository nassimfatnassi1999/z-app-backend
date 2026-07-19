import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProviderError } from '../providers/ai-provider.error';
import {
  AiProviderName,
  EmailAiProvider,
  EmailGenerationInput,
  GeneratedEmail,
  ProviderHealthState,
} from '../providers/email-ai-provider.types';
import { GeminiEmailAiProvider } from '../providers/gemini-email-ai.provider';
import { GroqEmailAiProvider } from '../providers/groq-email-ai.provider';
import { OpenRouterEmailAiProvider } from '../providers/openrouter-email-ai.provider';
import { InMemoryRoundRobinCounter } from './round-robin-counter.service';

const FAILOVER_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

@Injectable()
export class AiProviderRouterService implements OnModuleInit {
  private readonly logger = new Logger(AiProviderRouterService.name);
  private readonly providerByName: Map<AiProviderName, EmailAiProvider>;
  private readonly orderedNames: AiProviderName[];
  private readonly health = new Map<AiProviderName, ProviderHealthState>();
  private readonly invalidConfiguration = new Set<AiProviderName>();
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;

  constructor(
    config: ConfigService,
    groq: GroqEmailAiProvider,
    gemini: GeminiEmailAiProvider,
    openRouter: OpenRouterEmailAiProvider,
    private readonly counter: InMemoryRoundRobinCounter,
  ) {
    this.providerByName = new Map<AiProviderName, EmailAiProvider>([
      [groq.name, groq],
      [gemini.name, gemini],
      [openRouter.name, openRouter],
    ]);
    this.orderedNames = this.parseOrder(
      config.get<string>('AI_PROVIDER_ORDER') ?? 'groq,gemini,openrouter',
    );
    this.timeoutMs = Number(config.get<string>('AI_PROVIDER_TIMEOUT_MS') ?? 30_000);
    this.maxAttempts = Number(config.get<string>('AI_PROVIDER_MAX_ATTEMPTS') ?? 3);
    this.failureThreshold = Number(config.get<string>('AI_CIRCUIT_BREAKER_FAILURE_THRESHOLD') ?? 3);
    this.cooldownMs = Number(config.get<string>('AI_CIRCUIT_BREAKER_COOLDOWN_MS') ?? 60_000);
    for (const name of Object.values(AiProviderName)) {
      this.health.set(name, this.emptyHealth());
    }
  }

  onModuleInit() {
    if (this.getAvailableProviders().length === 0) {
      throw new Error('At least one AI email provider must be configured');
    }
  }

  async generateEmail(input: EmailGenerationInput): Promise<GeneratedEmail> {
    if (!input.transcript?.trim()) {
      throw new TypeError('Email generation requires a non-empty transcript');
    }

    const providers = this.getAvailableProviders();
    if (providers.length === 0) {
      throw new ServiceUnavailableException('Aucun fournisseur IA n’est configuré.');
    }

    const startIndex = await this.counter.next(providers.length);
    const attemptLimit = Math.min(this.maxAttempts, providers.length);
    let attempts = 0;
    let lastError: unknown;

    for (let offset = 0; offset < providers.length && attempts < attemptLimit; offset += 1) {
      const provider = providers[(startIndex + offset) % providers.length];
      if (!this.isProviderHealthy(provider.name)) continue;

      attempts += 1;
      const startedAt = Date.now();
      this.logger.log(
        `AI request started provider=${provider.name} attempt=${attempts} model=${provider.model}`,
      );
      try {
        const result = await this.executeWithTimeout(provider, input);
        this.registerSuccess(provider.name);
        this.logger.log(
          `AI request succeeded provider=${provider.name} attempt=${attempts} model=${provider.model} latencyMs=${Date.now() - startedAt}`,
        );
        return result;
      } catch (error) {
        lastError = error;
        const eligible = this.isFailoverEligible(error);
        if (!eligible) throw error;

        this.registerFailure(provider.name, error);
        this.logger.warn(
          `AI provider failed provider=${provider.name} attempt=${attempts} model=${provider.model} reason=${this.errorReason(error)} latencyMs=${Date.now() - startedAt}`,
        );
        if (attempts < attemptLimit) {
          this.logger.warn(
            `AI failover triggered after=${provider.name} nextAttempt=${attempts + 1}`,
          );
        }
      }
    }

    throw new ServiceUnavailableException(
      'Tous les fournisseurs IA sont temporairement indisponibles.',
      { cause: lastError },
    );
  }

  getHealthState(name: AiProviderName): Readonly<ProviderHealthState> {
    return { ...(this.health.get(name) ?? this.emptyHealth()) };
  }

  private getAvailableProviders() {
    return this.orderedNames
      .map((name) => this.providerByName.get(name))
      .filter(
        (provider): provider is EmailAiProvider =>
          Boolean(provider?.isConfigured()) && !this.invalidConfiguration.has(provider!.name),
      );
  }

  private parseOrder(value: string) {
    const supported = new Set(Object.values(AiProviderName));
    const names = value
      .split(',')
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean);
    const invalid = names.filter((name) => !supported.has(name as AiProviderName));
    if (invalid.length) {
      throw new Error(`AI_PROVIDER_ORDER contains unsupported providers: ${invalid.join(', ')}`);
    }
    return [...new Set(names as AiProviderName[])];
  }

  private isProviderHealthy(name: AiProviderName) {
    const state = this.health.get(name)!;
    if (state.circuitOpenUntil === null) return true;
    if (state.circuitOpenUntil > Date.now()) return false;
    state.circuitOpenUntil = null;
    this.logger.log(`AI circuit breaker closed provider=${name}`);
    return true;
  }

  private async executeWithTimeout(provider: EmailAiProvider, input: EmailGenerationInput) {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        provider.generateEmail(input),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(
            () => reject(new AiProviderError('timeout', 'AI provider request timed out')),
            this.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private registerFailure(name: AiProviderName, error: unknown) {
    const state = this.health.get(name)!;
    const now = Date.now();
    state.consecutiveFailures += 1;
    state.lastFailureAt = now;
    if (error instanceof AiProviderError && error.kind === 'authentication') {
      this.invalidConfiguration.add(name);
      this.logger.error(
        `AI provider configuration invalid provider=${name} status=${error.status}`,
      );
    }
    if (state.consecutiveFailures >= this.failureThreshold) {
      state.circuitOpenUntil = now + this.cooldownMs;
      this.logger.warn(`AI circuit breaker opened provider=${name} cooldownMs=${this.cooldownMs}`);
    }
  }

  private registerSuccess(name: AiProviderName) {
    const state = this.health.get(name)!;
    state.consecutiveFailures = 0;
    state.circuitOpenUntil = null;
    state.lastSuccessAt = Date.now();
  }

  private isFailoverEligible(error: unknown) {
    if (!(error instanceof AiProviderError)) return false;
    if (error.kind === 'http')
      return Boolean(error.status && FAILOVER_HTTP_STATUSES.has(error.status));
    return true;
  }

  private errorReason(error: unknown) {
    if (error instanceof AiProviderError) {
      return error.status ? `${error.kind}_${error.status}` : error.kind;
    }
    return error instanceof Error ? error.name : 'unknown';
  }

  private emptyHealth(): ProviderHealthState {
    return {
      consecutiveFailures: 0,
      circuitOpenUntil: null,
      lastFailureAt: null,
      lastSuccessAt: null,
    };
  }
}
