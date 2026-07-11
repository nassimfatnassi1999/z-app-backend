import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithTimeout } from '../../common/http/fetch-with-timeout';
import { GenerateEmailDto } from './dto/generate-email.dto';
import { AiPipelineException } from './ai-pipeline.error';
import { EMAIL_TYPES, EmailIntentAnalysis, EmailType } from './ai.types';
import { parseGroqJson } from './groq-json-parser';
import { PromptBuilderService } from './prompt-builder.service';
import { resolveGroqModels } from '../../config/ai-models';

@Injectable()
export class AIAnalysisService {
  constructor(
    private readonly config: ConfigService,
    private readonly prompts: PromptBuilderService,
  ) {}

  async analyze(
    raw: string,
    cleaned: string,
    dto: GenerateEmailDto,
    requestId: string,
  ): Promise<{ analysis: EmailIntentAnalysis; model: string; fallbackUsed: boolean }> {
    const { primary, fallback } = resolveGroqModels(this.config);
    let lastError: unknown;
    for (const model of [...new Set([primary, fallback])]) {
      try {
        const value = await this.call(model, this.prompts.analysis(raw, cleaned, dto), requestId);
        return { analysis: this.validate(value), model, fallbackUsed: model !== primary };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof AiPipelineException
      ? lastError
      : new AiPipelineException('AI_ANALYSIS_FAILED', true, requestId, 'Analysis failed');
  }

  private async call(model: string, messages: unknown, requestId: string) {
    const key = this.config.get<string>('GROQ_API_KEY') || '';
    const timeoutMs = Number(this.config.get('GROQ_TIMEOUT_MS')) || 30000;
    const retries = Number(this.config.get('GROQ_MAX_RETRIES')) || 2;
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
            temperature: Number(this.config.get('AI_ANALYSIS_TEMPERATURE')) || 0.1,
            top_p: 0.9,
            max_completion_tokens: Number(this.config.get('AI_MAX_COMPLETION_TOKENS')) || 1200,
            response_format: { type: 'json_object' },
            messages,
          }),
        },
        { timeoutMs, retries, errorMessage: 'Groq analysis timeout' },
      );
      if (!response.ok) throw new Error(`Groq analysis HTTP ${response.status}`);
      const envelope = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return parseGroqJson(envelope.choices?.[0]?.message?.content);
    } catch (error) {
      throw new AiPipelineException(
        'AI_ANALYSIS_FAILED',
        true,
        requestId,
        error instanceof Error ? error.message : 'Analysis failed',
      );
    }
  }

  private validate(v: Record<string, any>): EmailIntentAnalysis {
    const str = (x: unknown, fallback = '') => (typeof x === 'string' ? x.trim() : fallback);
    const nullable = (x: unknown) => str(x) || null;
    const list = (x: unknown) =>
      Array.isArray(x) && x.every((i) => typeof i === 'string')
        ? x.map((i) => i.trim()).filter(Boolean)
        : [];
    const recipient = v.recipient && typeof v.recipient === 'object' ? v.recipient : {};
    const sender = v.sender && typeof v.sender === 'object' ? v.sender : {};
    const emailType = EMAIL_TYPES.includes(v.emailType as EmailType)
      ? (v.emailType as EmailType)
      : 'other';
    if (!str(v.sourceLanguage) || !str(v.outputLanguage) || !str(v.mainIntent))
      throw new Error('Invalid analysis schema');
    return {
      sourceLanguage: str(v.sourceLanguage),
      outputLanguage: str(v.outputLanguage),
      outputLanguageSource: [
        'explicit_request',
        'user_preference',
        'detected_language',
        'fallback',
      ].includes(v.outputLanguageSource)
        ? v.outputLanguageSource
        : 'detected_language',
      emailType,
      mainIntent: str(v.mainIntent),
      recipient: {
        name: nullable(recipient.name),
        role: nullable(recipient.role),
        organization: nullable(recipient.organization),
        relationship: str(recipient.relationship, 'unknown'),
      },
      sender: {
        name: nullable(sender.name),
        role: nullable(sender.role),
        organization: nullable(sender.organization),
      },
      tone: str(v.tone, 'professional'),
      requestedLength: ['very_short', 'short', 'medium', 'detailed'].includes(v.requestedLength)
        ? v.requestedLength
        : 'medium',
      subjectGoal: str(v.subjectGoal),
      facts: list(v.facts),
      dates: list(v.dates),
      amounts: list(v.amounts),
      locations: list(v.locations),
      actionRequested: nullable(v.actionRequested),
      deadline: nullable(v.deadline),
      attachmentsMentioned: list(v.attachmentsMentioned),
      constraints: list(v.constraints),
      sensitiveDetails: list(v.sensitiveDetails),
      ambiguousDetails: list(v.ambiguousDetails),
      missingCriticalInformation: list(v.missingCriticalInformation),
      mustNotInvent: list(v.mustNotInvent),
      confidence: Math.max(0, Math.min(1, Number(v.confidence) || 0)),
    };
  }
}
