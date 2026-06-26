import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenerateEmailDto } from './dto/generate-email.dto';
import {
  EmailPlan,
  ExtractedEntities,
  GeneratedEmailResponse,
  PipelineContext,
  PromptMessages,
} from './ai.types';
import { DateExtractorService } from './date-extractor.service';
import { EmailPlannerService } from './email-planner.service';
import { EmailValidatorService } from './email-validator.service';
import { FallbackGeneratorService } from './fallback-generator.service';
import { IntentExtractorService } from './intent-extractor.service';
import { LanguageDetectorService } from './language-detector.service';
import { PromptBuilderService } from './prompt-builder.service';
import { RecipientDetectorService } from './recipient-detector.service';
import { TranscriptAnalyzerService } from './transcript-analyzer.service';

export interface AiProvider {
  generateEmail(dto: GenerateEmailDto): Promise<GeneratedEmailResponse>;
}

@Injectable()
export class AiService implements AiProvider {
  private readonly logger = new Logger(AiService.name);
  private readonly maxAttempts = 2;

  constructor(
    private readonly config: ConfigService,
    private readonly languageDetector: LanguageDetectorService,
    private readonly transcriptAnalyzer: TranscriptAnalyzerService,
    private readonly intentExtractor: IntentExtractorService,
    private readonly recipientDetector: RecipientDetectorService,
    private readonly dateExtractor: DateExtractorService,
    private readonly planner: EmailPlannerService,
    private readonly promptBuilder: PromptBuilderService,
    private readonly validator: EmailValidatorService,
    private readonly fallback: FallbackGeneratorService,
  ) {}

  async generateEmail(dto: GenerateEmailDto): Promise<GeneratedEmailResponse> {
    const context = this.toContext(dto);
    const pipeline = this.buildPipeline(context);
    const baseConfidence = this.confidence(pipeline);
    const apiKey = this.config.get<string>('GROQ_API_KEY');

    if (!apiKey || apiKey.startsWith('REPLACE_WITH')) {
      return this.fallback.generate(pipeline.plan, baseConfidence);
    }

    return this.generateWithProvider(apiKey, pipeline.plan, context, baseConfidence);
  }

  private buildPipeline(context: PipelineContext) {
    const transcript = this.transcriptAnalyzer.analyze(context.transcript);
    const language = this.languageDetector.analyze(context);
    const intent = this.intentExtractor.extract(transcript.cleanedTranscript);
    const entities = this.extractEntities(context, language.outputLanguage);
    const plan = this.planner.plan({
      transcript,
      language,
      intent,
      entities,
      selectedTone: context.selectedTone,
      customTone: context.customTone,
    });

    this.logPipeline(context, plan, language.confidence, intent.confidence);
    return { transcript, language, intent, entities, plan };
  }

  private async generateWithProvider(
    apiKey: string,
    plan: EmailPlan,
    context: PipelineContext,
    baseConfidence: number,
  ) {
    let retryFeedback: string | undefined;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const startedAt = Date.now();
      try {
        const messages = this.promptBuilder.build(plan, context.transcript, retryFeedback);
        const parsed = await this.callGroq(apiKey, messages);
        const email = this.normalizeProviderResponse(parsed, plan, baseConfidence, 'groq');
        const validation = this.validator.validate(email, plan);
        this.logger.debug(
          `AI provider attempt ${attempt} latency=${Date.now() - startedAt}ms valid=${validation.valid}`,
        );
        if (validation.valid) return email;
        retryFeedback = validation.errors.join(', ');
      } catch (error) {
        retryFeedback = error instanceof Error ? error.message : 'provider_error';
        this.logger.warn(`AI provider attempt ${attempt} failed: ${retryFeedback}`);
      }
    }
    return this.fallback.generate(plan, Math.max(baseConfidence - 18, 45));
  }

  private async callGroq(apiKey: string, messages: PromptMessages) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile',
          temperature: 0.25,
          messages: [
            { role: 'system', content: messages.system },
            { role: 'system', content: messages.developer },
            { role: 'user', content: messages.user },
          ],
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) throw new Error(`groq_http_${response.status}`);
      return this.parseJson((await response.json()) as ProviderResponse);
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseJson(response: ProviderResponse) {
    const content = response.choices?.[0]?.message?.content;
    if (!content) throw new Error('empty_provider_response');
    try {
      return JSON.parse(content) as Record<string, unknown>;
    } catch {
      throw new Error('malformed_provider_json');
    }
  }

  private normalizeProviderResponse(
    value: Record<string, unknown>,
    plan: EmailPlan,
    confidence: number,
    provider: string,
  ): GeneratedEmailResponse {
    const recipient = this.stringValue(value.recipient) || plan.recipient || '';
    return {
      subject: this.stringValue(value.subject) || plan.subjectHint,
      body: this.stringValue(value.body),
      language: plan.language,
      outputLanguage: plan.language,
      purpose: this.stringValue(value.purpose) || plan.intent.purpose,
      recipient,
      detectedLanguage: plan.transcriptLanguage,
      confidence,
      extractedEntities: plan.entities,
      suggestedRecipient: this.stringValue(value.suggestedRecipient) || recipient,
      tone: this.stringValue(value.tone) || plan.tone,
      intent: this.stringValue(value.purpose) || plan.intent.purpose,
      provider,
    };
  }

  private extractEntities(context: PipelineContext, language: ExtractedEntities['language']) {
    const recipients = this.recipientDetector.detect(context.transcript);
    const date = this.dateExtractor.extract(context.transcript);
    const customInstructions = [
      ...(context.customTone ? [context.customTone] : []),
      ...(context.template ? [`Template: ${context.template}`] : []),
    ];
    return {
      recipients,
      recipient: recipients[0],
      company: recipients[0],
      ...date,
      language,
      customInstructions,
    };
  }

  private confidence(pipeline: ReturnType<AiService['buildPipeline']>) {
    const recipientScore = pipeline.entities.recipient ? 10 : 0;
    const transcriptScore = pipeline.transcript.cleanedTranscript.length > 20 ? 10 : -10;
    const injectionPenalty = pipeline.transcript.injectionRisk ? 15 : 0;
    return Math.max(
      35,
      Math.min(
        100,
        Math.round(
          (pipeline.language.confidence + pipeline.intent.confidence) / 2 +
            recipientScore +
            transcriptScore -
            injectionPenalty,
        ),
      ),
    );
  }

  private toContext(dto: GenerateEmailDto): PipelineContext {
    return {
      transcript: dto.transcript,
      selectedOutputLanguage: dto.outputLanguage,
      selectedTone: dto.tone,
      customTone: dto.customTone,
      template: dto.template || dto.templateKey,
      transcriptLanguage: dto.language,
    };
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private logPipeline(
    context: PipelineContext,
    plan: EmailPlan,
    languageConfidence: number,
    intentConfidence: number,
  ) {
    this.logger.debug(
      JSON.stringify({
        transcriptLength: context.transcript.length,
        detectedLanguage: plan.transcriptLanguage,
        outputLanguage: plan.language,
        intent: plan.intent.purpose,
        entities: plan.entities,
        languageConfidence,
        intentConfidence,
      }),
    );
  }
}

type ProviderResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};
