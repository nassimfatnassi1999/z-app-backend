import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { fetchWithTimeout } from '../../common/http/fetch-with-timeout';
import { AIAnalysisService } from './ai-analysis.service';
import { AiPipelineException, AiErrorCode } from './ai-pipeline.error';
import {
  EMAIL_ANALYSIS_PROMPT_VERSION,
  EMAIL_GENERATION_PROMPT_VERSION,
  EMAIL_TYPES,
  EmailIntentAnalysis,
  EmailType,
  GeneratedEmailResponse,
} from './ai.types';
import { GenerateEmailDto } from './dto/generate-email.dto';
import { EmailValidationService } from './email-validation.service';
import { parseGroqJson } from './groq-json-parser';
import { detectRequestedOutputLanguage, resolveEffectiveOutputLanguage } from './language-context';
import { PromptBuilderService } from './prompt-builder.service';
import { TranscriptCleanerService } from './transcript-cleaner.service';
import { DEFAULT_DEEPGRAM_MODEL, resolveGroqModels } from '../../config/ai-models';

@Injectable()
export class EmailGenerationService {
  private readonly logger = new Logger(EmailGenerationService.name);
  constructor(
    private readonly config: ConfigService,
    private readonly cleaner: TranscriptCleanerService,
    private readonly prompts: PromptBuilderService,
    private readonly validation: EmailValidationService,
    private readonly analysisService: AIAnalysisService,
  ) {}

  async generate(dto: GenerateEmailDto): Promise<GeneratedEmailResponse> {
    const started = performance.now();
    const requestId = dto.requestId?.trim() || randomUUID();
    const raw = dto.transcript.trim();
    const cleaned = this.cleaner.clean(raw);
    if (cleaned.length < 3)
      throw new BadRequestException({
        code: 'AI_INVALID_RESPONSE',
        message: 'La transcription est vide.',
        retryable: false,
        requestId,
      });
    if (dto.tone === 'custom' && !dto.customTone?.trim())
      throw new BadRequestException({
        code: 'AI_INVALID_RESPONSE',
        message: 'Le ton personnalisé est requis.',
        retryable: false,
        requestId,
      });
    const key = this.config.get<string>('GROQ_API_KEY') || '';
    if (!key || key.startsWith('REPLACE_WITH'))
      throw new AiPipelineException(
        'AI_GENERATION_FAILED',
        false,
        requestId,
        'GROQ_API_KEY missing',
      );
    const transcriptRequest = detectRequestedOutputLanguage(raw);
    const detected = dto.detectedSpeechLanguage || dto.language;
    dto.effectiveOutputLanguage = resolveEffectiveOutputLanguage({
      requestedOutputLanguage: dto.requestedOutputLanguage,
      transcriptRequestedLanguage: transcriptRequest,
      detectedSpeechLanguage: detected,
      speechLanguageMode: dto.speechLanguageMode || 'auto',
      appLanguage: dto.appLanguage,
    });
    const analysisStarted = performance.now();
    const analyzed = await this.analysisService.analyze(raw, cleaned, dto, requestId);
    const analysisDurationMs = Math.round(performance.now() - analysisStarted);
    // Explicitly resolved client/transcript preference always wins over model inference.
    analyzed.analysis.outputLanguage = dto.effectiveOutputLanguage;
    const generatedStarted = performance.now();
    const generated = await this.generateWithFallback(
      key,
      raw,
      cleaned,
      analyzed.analysis,
      dto,
      requestId,
    );
    const generationDurationMs = Math.round(performance.now() - generatedStarted);
    const draft = this.normalize(generated.value, analyzed.analysis, requestId);
    const blocking = this.validation.validate(draft, raw, analyzed.analysis);
    if (blocking.length)
      throw new AiPipelineException('AI_INVALID_RESPONSE', true, requestId, blocking.join('; '));
    const warnings = [
      ...new Set([
        ...(Array.isArray(generated.value.warnings) ? generated.value.warnings.map(String) : []),
        ...this.validation.warnings(draft, raw, analyzed.analysis),
      ]),
    ];
    const totalDurationMs = Math.round(performance.now() - started);
    draft.warnings = warnings;
    draft.missingInformation = analyzed.analysis.missingCriticalInformation;
    draft.validationScore = warnings.length ? Math.max(0.5, 1 - warnings.length * 0.08) : 1;
    draft.timings = {
      generationMs: generationDurationMs,
      validationMs: 0,
      totalMs: totalDurationMs,
    };
    draft.metadata = {
      model: generated.model,
      deepgramModel: this.config.get<string>('DEEPGRAM_MODEL') || DEFAULT_DEEPGRAM_MODEL,
      groqPrimaryModel: resolveGroqModels(this.config).primary,
      actualGroqModelUsed: generated.model,
      fallbackUsed: analyzed.fallbackUsed || generated.fallbackUsed,
      analysisDurationMs,
      generationDurationMs,
      totalDurationMs,
      analysisPromptVersion: EMAIL_ANALYSIS_PROMPT_VERSION,
      generationPromptVersion: EMAIL_GENERATION_PROMPT_VERSION,
    };
    Object.assign(draft, {
      speechLanguageMode: dto.speechLanguageMode || 'auto',
      detectedSpeechLanguage: detected,
      requestedOutputLanguage: dto.requestedOutputLanguage,
      effectiveOutputLanguage: dto.effectiveOutputLanguage,
      speechConfidence: dto.speechConfidence,
    });
    this.logger.log(
      JSON.stringify({
        event: 'email_generation_completed',
        requestId,
        deepgramModel: draft.metadata.deepgramModel,
        groqPrimaryModel: draft.metadata.groqPrimaryModel,
        actualGroqModelUsed: generated.model,
        fallbackUsed: draft.metadata.fallbackUsed,
        detectedLanguage: analyzed.analysis.sourceLanguage,
        outputLanguage: draft.language,
        emailType: draft.emailType,
        analysisDurationMs,
        generationDurationMs,
        totalDurationMs,
        success: true,
      }),
    );
    return draft;
  }

  private async generateWithFallback(
    key: string,
    raw: string,
    cleaned: string,
    analysis: EmailIntentAnalysis,
    dto: GenerateEmailDto,
    requestId: string,
  ) {
    const { primary, fallback } = resolveGroqModels(this.config);
    let last: unknown;
    for (const model of [...new Set([primary, fallback])]) {
      try {
        return {
          value: await this.call(
            key,
            model,
            this.prompts.generation(
              raw,
              cleaned,
              analysis,
              dto,
              dto.currentBody ? { subject: dto.subject, body: dto.currentBody } : undefined,
            ),
            requestId,
          ),
          model,
          fallbackUsed: model !== primary,
        };
      } catch (error) {
        last = error;
        this.logger.warn(
          JSON.stringify({
            event: 'ai_generation_attempt_failed',
            requestId,
            model,
            code: error instanceof AiPipelineException ? error.code : 'unknown',
          }),
        );
      }
    }
    throw last instanceof AiPipelineException
      ? last
      : new AiPipelineException('AI_GENERATION_FAILED', true, requestId, 'Generation failed');
  }

  private async call(key: string, model: string, messages: unknown, requestId: string) {
    try {
      const response = await fetchWithTimeout(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${key}`,
            'content-type': 'application/json',
            'x-request-id': requestId,
          },
          body: JSON.stringify({
            model,
            temperature: Number(this.config.get('AI_GENERATION_TEMPERATURE')) || 0.25,
            top_p: 0.9,
            max_completion_tokens: Number(this.config.get('AI_MAX_COMPLETION_TOKENS')) || 1200,
            response_format: { type: 'json_object' },
            messages,
          }),
        },
        {
          timeoutMs: Number(this.config.get('GROQ_TIMEOUT_MS')) || 30000,
          retries: Number(this.config.get('GROQ_MAX_RETRIES')) || 2,
          errorMessage: 'Groq generation timeout',
        },
      );
      if (!response.ok) {
        const code: AiErrorCode =
          response.status === 429
            ? 'AI_RATE_LIMITED'
            : response.status === 404
              ? 'AI_MODEL_UNAVAILABLE'
              : 'AI_GENERATION_FAILED';
        throw new AiPipelineException(
          code,
          response.status !== 404,
          requestId,
          `Groq HTTP ${response.status}`,
          response.status === 429 ? 429 : 503,
        );
      }
      const envelope = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return parseGroqJson(envelope.choices?.[0]?.message?.content);
    } catch (error) {
      if (error instanceof AiPipelineException) throw error;
      throw new AiPipelineException(
        'AI_INVALID_RESPONSE',
        true,
        requestId,
        error instanceof Error ? error.message : 'Invalid provider response',
      );
    }
  }

  private normalize(
    v: Record<string, any>,
    a: EmailIntentAnalysis,
    requestId: string,
  ): GeneratedEmailResponse {
    const type: EmailType = EMAIL_TYPES.includes(v.emailType) ? v.emailType : a.emailType;
    const subject =
      typeof v.subject === 'string'
        ? v.subject.replace(/^(?:subject|objet)\s*:\s*/i, '').trim()
        : '';
    const body =
      typeof v.body === 'string' ? v.body.replace(/^```(?:json)?|```$/gim, '').trim() : '';
    return {
      language: typeof v.language === 'string' ? v.language : a.outputLanguage,
      tone: typeof v.tone === 'string' ? v.tone : a.tone,
      intent: a.mainIntent,
      subject,
      body,
      suggestedRecipient: a.recipient.name || a.recipient.role || '',
      confidence: a.confidence,
      emailType: type,
      detectedTone: a.tone,
      detectedLanguage: a.sourceLanguage,
      generationConfidence: a.confidence,
      validationScore: 0,
      requestId,
      warnings: [],
      missingInformation: [],
      metadata: {
        model: '',
        deepgramModel: '',
        groqPrimaryModel: '',
        actualGroqModelUsed: '',
        fallbackUsed: false,
        analysisDurationMs: 0,
        generationDurationMs: 0,
        totalDurationMs: 0,
        analysisPromptVersion: EMAIL_ANALYSIS_PROMPT_VERSION,
        generationPromptVersion: EMAIL_GENERATION_PROMPT_VERSION,
      },
      timings: { generationMs: 0, validationMs: 0, totalMs: 0 },
    };
  }
}
