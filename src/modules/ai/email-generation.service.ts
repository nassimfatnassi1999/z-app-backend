import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { performance } from 'perf_hooks';
import { fetchWithTimeout } from '../../common/http/fetch-with-timeout';
import { GenerateEmailDto } from './dto/generate-email.dto';
import { AiPipelineException, AiErrorCode } from './ai-pipeline.error';
import { EMAIL_TYPES, EmailType, GeneratedEmailResponse, TranscriptAnalysis } from './ai.types';
import { EmailValidationService } from './email-validation.service';
import { InvalidGroqJsonError, parseGroqJson } from './groq-json-parser';
import { PromptBuilderService } from './prompt-builder.service';
import { TranscriptCleanerService } from './transcript-cleaner.service';
import { detectRequestedOutputLanguage, resolveEffectiveOutputLanguage } from './language-context';

type LocalFacts = {
  people: string[];
  dates: string[];
  times: string[];
  amounts: string[];
  locations: string[];
  references: string[];
};

@Injectable()
export class EmailGenerationService {
  private readonly logger = new Logger(EmailGenerationService.name);
  constructor(
    private readonly config: ConfigService,
    private readonly cleaner: TranscriptCleanerService,
    private readonly prompts: PromptBuilderService,
    private readonly validation: EmailValidationService,
  ) {}

  async generate(dto: GenerateEmailDto): Promise<GeneratedEmailResponse> {
    const started = performance.now();
    const requestId = dto.requestId?.trim() || randomUUID();
    const transcript = this.cleaner.clean(dto.transcript);
    if (transcript.length < 3)
      throw new BadRequestException({
        code: 'AI_INVALID_RESPONSE',
        message: 'La transcription est vide.',
        retryable: false,
        requestId,
      });
    const speechLanguageMode = dto.speechLanguageMode || 'auto';
    const transcriptRequestedLanguage = detectRequestedOutputLanguage(transcript);
    const explicitlyRequestedOutputLanguage = dto.requestedOutputLanguage;
    const detectedSpeechLanguage = dto.detectedSpeechLanguage || dto.language;
    const effectiveOutputLanguage = resolveEffectiveOutputLanguage({
      requestedOutputLanguage: explicitlyRequestedOutputLanguage,
      transcriptRequestedLanguage,
      detectedSpeechLanguage,
      speechLanguageMode,
      appLanguage: dto.appLanguage,
    });
    dto.effectiveOutputLanguage = effectiveOutputLanguage;
    this.logger.debug(
      JSON.stringify({
        event: 'LANGUAGE_PIPELINE',
        speechLanguageMode,
        detectedSpeechLanguage,
        requestedOutputLanguage: explicitlyRequestedOutputLanguage,
        transcriptRequestedLanguage,
        effectiveOutputLanguage,
        transcriptLength: transcript.length,
      }),
    );
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
        'GROQ_API_KEY is missing',
      );

    const facts = this.extractFacts(transcript);
    let previous: Record<string, any> | null = null;
    let issues = ['Initial generation was not attempted'];
    this.logger.log(
      JSON.stringify({
        event: 'AI_GENERATION_START',
        requestId,
        transcriptLength: transcript.length,
        model: this.model,
        hasApiKey: Boolean(key),
      }),
    );
    for (let attempt = 0; attempt < 1; attempt += 1) {
      const generationStarted = performance.now();
      try {
        previous = await this.call(
          key,
          attempt === 0
            ? this.prompts.fastPath(transcript, dto, facts)
            : this.prompts.fallback(transcript, dto, facts, previous, issues),
          requestId,
        );
        const generationMs = performance.now() - generationStarted;
        const analysis = this.analysisFrom(previous, dto, facts);
        const draft = this.normalize(previous, analysis, requestId);
        const validationStarted = performance.now();
        issues = this.validation.validate(draft, transcript, analysis);
        const validationMs = performance.now() - validationStarted;
        if (!issues.length) {
          draft.validationScore = 1;
          draft.timings = {
            generationMs: Math.round(generationMs),
            validationMs: Math.round(validationMs),
            totalMs: Math.round(performance.now() - started),
          };
          this.logger.log(
            JSON.stringify({
              event: 'ai_generation_succeeded',
              requestId,
              model: this.model,
              attempt: attempt + 1,
              transcriptLength: transcript.length,
              ...draft.timings,
            }),
          );
          const warnings = this.validation.warnings(draft, transcript, analysis);
          if (warnings.length)
            this.logger.warn(
              JSON.stringify({ event: 'ai_validation_warnings', requestId, warnings }),
            );
          return this.withLanguageContext(draft, {
            speechLanguageMode,
            detectedSpeechLanguage,
            requestedOutputLanguage: explicitlyRequestedOutputLanguage,
            effectiveOutputLanguage,
            speechConfidence: dto.speechConfidence,
          });
        }
        this.logger.warn(
          JSON.stringify({
            event: 'ai_validation_failed',
            requestId,
            attempt: attempt + 1,
            issues,
            generationMs: Math.round(generationMs),
            validationMs: Math.round(validationMs),
          }),
        );
      } catch (error) {
        if (
          error instanceof AiPipelineException &&
          (!error.retryable || error.code === 'AI_MODEL_UNAVAILABLE')
        )
          throw error;
        issues = [error instanceof Error ? error.message : 'Unknown Groq response error'];
        this.logger.error(
          JSON.stringify({
            event: 'ai_attempt_failed',
            requestId,
            attempt: attempt + 1,
            errorType: error instanceof Error ? error.constructor.name : typeof error,
            internalMessage: issues[0],
          }),
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
    const fallback = this.localFallback(transcript, dto, requestId, started);
    this.logger.warn(JSON.stringify({ event: 'ai_local_fallback', requestId, issues }));
    return this.withLanguageContext(fallback, {
      speechLanguageMode,
      detectedSpeechLanguage,
      requestedOutputLanguage: explicitlyRequestedOutputLanguage,
      effectiveOutputLanguage,
      speechConfidence: dto.speechConfidence,
    });
  }

  async diagnose(text: string): Promise<{ raw: string; model: string }> {
    const requestId = randomUUID();
    const key = this.config.get<string>('GROQ_API_KEY') || '';
    const response = await fetchWithTimeout(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_completion_tokens: 600,
          messages: [
            {
              role: 'system',
              content:
                'Tu rédiges des emails professionnels. Retourne uniquement un JSON valide avec subject et body.',
            },
            { role: 'user', content: text },
          ],
        }),
      },
      { timeoutMs: 18_000, retries: 0, errorMessage: 'Groq diagnostic failed' },
    );
    const json = (await response.json()) as any;
    const raw = String(json.choices?.[0]?.message?.content || '');
    if (!response.ok || !raw)
      throw new AiPipelineException(
        'AI_GENERATION_FAILED',
        true,
        requestId,
        `Diagnostic Groq HTTP ${response.status}`,
      );
    return { raw, model: String(json.model || this.model) };
  }

  private get model() {
    return this.config.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';
  }

  private async call(
    key: string,
    messages: unknown,
    requestId: string,
  ): Promise<Record<string, any>> {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${key}`,
            'content-type': 'application/json',
            'x-request-id': requestId,
          },
          body: JSON.stringify({
            model: this.model,
            temperature: 0.3,
            top_p: 0.9,
            max_completion_tokens: 2200,
            messages,
          }),
        },
        {
          timeoutMs: 18_000,
          retries: 1,
          retryStatuses: [429, 502, 503, 504],
          errorMessage: 'Groq request timed out',
        },
      );
    } catch (error) {
      throw new AiPipelineException(
        'AI_TIMEOUT',
        true,
        requestId,
        error instanceof Error ? error.message : 'Groq timeout',
      );
    }
    if (!response.ok) {
      const body = (await response.text()).slice(0, 1000);
      const mapping: Record<number, [AiErrorCode, boolean]> = {
        404: ['AI_MODEL_UNAVAILABLE', false],
        429: ['AI_RATE_LIMITED', true],
      };
      const [code, retryable] = mapping[response.status] || [
        'AI_GENERATION_FAILED',
        response.status >= 500,
      ];
      throw new AiPipelineException(
        code,
        retryable,
        requestId,
        `Groq HTTP ${response.status}: ${body}`,
        response.status === 429 ? 429 : 503,
      );
    }
    try {
      const json = (await response.json()) as any;
      return parseGroqJson(json.choices?.[0]?.message?.content);
    } catch (error) {
      const message =
        error instanceof InvalidGroqJsonError ? error.message : 'Invalid Groq envelope';
      throw new AiPipelineException('AI_INVALID_RESPONSE', true, requestId, message);
    }
  }

  private analysisFrom(
    value: Record<string, any>,
    dto: GenerateEmailDto,
    facts: LocalFacts,
  ): TranscriptAnalysis {
    const extracted =
      value.extractedFacts && typeof value.extractedFacts === 'object' ? value.extractedFacts : {};
    const array = (name: string, fallback: string[]) =>
      Array.isArray(extracted[name]) ? extracted[name].map(String).filter(Boolean) : fallback;
    const rawType = String(value.emailType || 'other')
      .toLowerCase()
      .replace(/[ -]+/g, '_');
    const emailType: EmailType = EMAIL_TYPES.includes(rawType as EmailType)
      ? (rawType as EmailType)
      : 'other';
    return {
      language:
        dto.effectiveOutputLanguage || String(value.detectedLanguage || dto.language || 'en'),
      intent: String(value.intent || 'email_draft'),
      emailType,
      recipient: String(value.suggestedRecipient || dto.recipientName || ''),
      requestedAction: '',
      people: array('people', facts.people),
      company: '',
      dates: array('dates', facts.dates),
      times: array('times', facts.times),
      amounts: array('amounts', facts.amounts),
      places: array('locations', facts.locations),
      references: array('references', facts.references),
      priority: 'normal',
      detectedTone: String(value.detectedTone || value.tone || dto.tone || 'professional'),
      formality: 'neutral',
      importantInformation: [],
      confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)),
    };
  }

  private normalize(
    value: Record<string, any>,
    analysis: TranscriptAnalysis,
    requestId: string,
  ): GeneratedEmailResponse {
    const subject = String(value.subject || '')
      .replace(/^(?:subject|objet)\s*:\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    const body = String(value.body || '')
      .replace(/^\`\`\`(?:json)?|\`\`\`$/gim, '')
      .trim();
    return {
      language: analysis.language,
      tone: analysis.detectedTone,
      intent: analysis.intent,
      subject,
      body,
      suggestedRecipient: analysis.recipient,
      confidence: analysis.confidence,
      generationConfidence: analysis.confidence,
      validationScore: 0,
      emailType: analysis.emailType,
      detectedTone: analysis.detectedTone,
      detectedLanguage: analysis.language,
      requestId,
      timings: { generationMs: 0, validationMs: 0, totalMs: 0 },
    };
  }

  private extractFacts(transcript: string): LocalFacts {
    const unique = (values: string[]) => [...new Set(values.map((v) => v.trim()).filter(Boolean))];
    return {
      people: [],
      dates: unique(
        transcript.match(
          /\b(?:\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?|(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)(?:\s+prochain)?|(?:\d{1,2}\s+)?(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre))\b/giu,
        ) || [],
      ),
      times: unique(
        transcript.match(/\b(?:[01]?\d|2[0-3])(?:\s*(?:h|:|heures?)\s*\d{0,2})\b/giu) || [],
      ),
      amounts: unique(
        transcript.match(/\b\d[\d\s.,]*(?:€|euros?|\$|dollars?|dinars?|TND|USD|EUR)\b/giu) || [],
      ),
      locations: [],
      references: unique(
        transcript.match(/\b(?:réf(?:érence)?|ref)\s*[:#-]?\s*[A-Z0-9-]+\b/giu) || [],
      ),
    };
  }

  private localFallback(
    transcript: string,
    dto: GenerateEmailDto,
    requestId: string,
    started: number,
  ): GeneratedEmailResponse {
    const subject =
      transcript
        .replace(/[.!?]+/g, ' ')
        .trim()
        .split(/\s+/)
        .slice(0, 8)
        .join(' ') || 'Message';
    return {
      language: dto.effectiveOutputLanguage || dto.language || 'en',
      tone: dto.tone && dto.tone !== 'auto' ? dto.tone : 'professional',
      intent: 'email_draft',
      subject,
      body: transcript,
      suggestedRecipient: '',
      confidence: 0.4,
      generationConfidence: 0.4,
      validationScore: 0.5,
      emailType: 'other',
      detectedTone: 'professional',
      detectedLanguage: dto.detectedSpeechLanguage || dto.language || 'unknown',
      requestId,
      degradedMode: true,
      timings: {
        generationMs: 0,
        validationMs: 0,
        totalMs: Math.round(performance.now() - started),
      },
    };
  }

  private withLanguageContext(
    response: GeneratedEmailResponse,
    context: {
      speechLanguageMode: string;
      detectedSpeechLanguage?: string;
      requestedOutputLanguage?: string;
      effectiveOutputLanguage: string;
      speechConfidence?: number;
    },
  ): GeneratedEmailResponse {
    return { ...response, ...context };
  }
}
