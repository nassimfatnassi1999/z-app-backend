import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { fetchWithTimeout } from '../../common/http/fetch-with-timeout';
import { AIAnalysisService } from './ai-analysis.service';
import { AiPipelineException, AiErrorCode, EmailDraftValidationError } from './ai-pipeline.error';
import {
  EMAIL_ANALYSIS_PROMPT_VERSION,
  EMAIL_GENERATION_PROMPT_VERSION,
  EMAIL_TYPES,
  EmailIntentAnalysis,
  EmailSourceContext,
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
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EmailGenerationService {
  private readonly logger = new Logger(EmailGenerationService.name);
  constructor(
    private readonly config: ConfigService,
    private readonly cleaner: TranscriptCleanerService,
    private readonly prompts: PromptBuilderService,
    private readonly validation: EmailValidationService,
    private readonly analysisService: AIAnalysisService,
    private readonly prisma?: PrismaService,
  ) {}

  async generate(dto: GenerateEmailDto, userId?: string): Promise<GeneratedEmailResponse> {
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
    if (
      !dto.requestedOutputLanguage &&
      !transcriptRequest &&
      !dto.appLanguage &&
      !detected &&
      (!dto.speechLanguageMode || dto.speechLanguageMode === 'auto')
    ) {
      dto.effectiveOutputLanguage = analyzed.analysis.sourceLanguage || dto.effectiveOutputLanguage;
    }
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
    const sourceContext = this.sourceContext(raw, cleaned, analyzed.analysis, dto, transcriptRequest);
    const validationStarted = performance.now();
    let validationResult = this.validation.validateDraft(draft, sourceContext);
    let finalDraft = draft;
    let repairUsed = false;
    let repairMs = 0;
    if (!validationResult.valid && this.config.get<string>('AI_ENABLE_REPAIR', 'true') === 'true') {
      const repairStarted = performance.now();
      const repairedValue = await this.call(
        key,
        generated.model,
        this.prompts.build(this.prompts.promptId('repair'), {
          sourceContext,
          invalidDraft: { subject: draft.subject, body: draft.body, language: draft.language, tone: draft.tone },
          blockingIssues: validationResult.issues.filter((issue) => issue.severity === 'blocking'),
        }),
        requestId,
        Number(this.config.get('AI_REPAIR_TEMPERATURE')) || 0.1,
      );
      finalDraft = this.normalize(repairedValue, analyzed.analysis, requestId);
      validationResult = this.validation.validateDraft(finalDraft, sourceContext);
      repairUsed = true;
      repairMs = Math.round(performance.now() - repairStarted);
    }
    if (!validationResult.valid) {
      throw new EmailDraftValidationError(
        requestId,
        validationResult.issues.map(({ code, message }) => ({ code, message })),
      );
    }
    const validationMs = Math.round(performance.now() - validationStarted);
    const warnings = [
      ...new Set([
        ...(Array.isArray(generated.value.warnings) ? generated.value.warnings.map(String) : []),
        ...this.validation.warnings(finalDraft, raw, analyzed.analysis),
        ...validationResult.issues.filter((issue) => issue.severity === 'warning').map((issue) => issue.code),
      ]),
    ];
    const totalDurationMs = Math.round(performance.now() - started);
    finalDraft.warnings = warnings;
    finalDraft.missingInformation = analyzed.analysis.missingCriticalInformation;
    finalDraft.validationScore = warnings.length ? Math.max(0.5, 1 - warnings.length * 0.08) : 1;
    finalDraft.timings = {
      generationMs: generationDurationMs,
      validationMs,
      totalMs: totalDurationMs,
    };
    finalDraft.metadata = {
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
      generationId: randomUUID(),
      correlationId: requestId,
      analysisPromptId: this.prompts.promptId('analysis'),
      generationPromptId: this.prompts.promptId('generation'),
      repairPromptId: repairUsed ? this.prompts.promptId('repair') : undefined,
      enrichmentLevel: dto.enrichmentLevel || 'medium',
      repairUsed,
      validationCodes: validationResult.issues.map((issue) => issue.code),
    };
    Object.assign(finalDraft, {
      speechLanguageMode: dto.speechLanguageMode || 'auto',
      detectedSpeechLanguage: detected,
      requestedOutputLanguage: dto.requestedOutputLanguage,
      effectiveOutputLanguage: dto.effectiveOutputLanguage,
      speechConfidence: dto.speechConfidence,
    });
    if (this.prisma && finalDraft.metadata.generationId) {
      await this.prisma.emailGeneration.create({
        data: {
          generationId: finalDraft.metadata.generationId,
          correlationId: requestId,
          userId,
          analysisPromptId: this.prompts.promptId('analysis'),
          generationPromptId: this.prompts.promptId('generation'),
          repairPromptId: repairUsed ? this.prompts.promptId('repair') : null,
          provider: 'groq',
          model: generated.model,
          fallbackModelUsed: generated.fallbackUsed ? generated.model : null,
          temperature: Number(this.config.get('AI_GENERATION_TEMPERATURE')) || 0.25,
          inputLanguage: analyzed.analysis.sourceLanguage,
          outputLanguage: finalDraft.language,
          enrichmentLevel: dto.enrichmentLevel || 'medium',
          tone: finalDraft.tone,
          repairUsed,
          validationCodes: validationResult.issues.map((issue) => issue.code),
        },
      });
    }
    this.logger.log(
      JSON.stringify({
        event: 'email_generation_completed',
        requestId,
        deepgramModel: finalDraft.metadata.deepgramModel,
        groqPrimaryModel: finalDraft.metadata.groqPrimaryModel,
        actualGroqModelUsed: generated.model,
        fallbackUsed: finalDraft.metadata.fallbackUsed,
        detectedLanguage: analyzed.analysis.sourceLanguage,
        outputLanguage: draft.language,
        emailType: draft.emailType,
        analysisDurationMs,
        generationDurationMs,
        validationMs,
        repairMs,
        repairUsed,
        totalDurationMs,
        success: true,
      }),
    );
    return finalDraft;
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

  private async call(
    key: string,
    model: string,
    messages: unknown,
    requestId: string,
    temperature = Number(this.config.get('AI_GENERATION_TEMPERATURE')) || 0.25,
  ) {
    try {
      const response = await fetchWithTimeout(
        `${this.config.get<string>('GROQ_BASE_URL', 'https://api.groq.com/openai/v1')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${key}`,
            'content-type': 'application/json',
            'x-request-id': requestId,
          },
          body: JSON.stringify({
            model,
            temperature,
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

  private sourceContext(
    raw: string,
    cleaned: string,
    analysis: EmailIntentAnalysis,
    dto: GenerateEmailDto,
    transcriptRequestedLanguage?: string,
  ): EmailSourceContext {
    const requiredFacts = [
      ...analysis.facts.map((value) => ({ kind: 'other' as const, value })),
      ...analysis.dates.map((value) => ({ kind: 'date' as const, value })),
      ...analysis.amounts.map((value) => ({ kind: 'amount' as const, value })),
      ...analysis.locations.map((value) => ({ kind: 'location' as const, value })),
      ...analysis.attachmentsMentioned.map((value) => ({ kind: 'attachment' as const, value })),
    ];
    return {
      rawTranscript: raw,
      normalizedTranscript: cleaned,
      analysis,
      languageContext: {
        speechLanguageMode: dto.speechLanguageMode || 'auto',
        detectedSpeechLanguage: dto.detectedSpeechLanguage,
        requestedOutputLanguage: dto.requestedOutputLanguage,
        transcriptRequestedLanguage,
        userPreferredOutputLanguage: dto.appLanguage,
        effectiveOutputLanguage: dto.effectiveOutputLanguage || 'en',
        transcriptionConfidence: dto.speechConfidence,
        languageDetectionConfidence: undefined,
        resolutionSource: dto.requestedOutputLanguage
          ? 'api'
          : transcriptRequestedLanguage
            ? 'transcript'
            : dto.appLanguage
              ? 'preference'
              : dto.detectedSpeechLanguage
                ? 'detected'
                : dto.speechLanguageMode && dto.speechLanguageMode !== 'auto'
                  ? 'forced'
                  : 'default',
      },
      requiredFacts,
      requestedActions: analysis.actionRequested ? [analysis.actionRequested] : [],
      targetTone: dto.tone || analysis.tone || 'professional',
      targetEnrichmentLevel: dto.enrichmentLevel || 'medium',
    };
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
