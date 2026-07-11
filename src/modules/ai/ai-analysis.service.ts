import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithTimeout } from '../../common/http/fetch-with-timeout';
import { GenerateEmailDto } from './dto/generate-email.dto';
import { EMAIL_TYPES, EmailType, TranscriptAnalysis } from './ai.types';
import { PromptBuilderService } from './prompt-builder.service';

@Injectable()
export class AIAnalysisService {
  constructor(
    private readonly config: ConfigService,
    private readonly prompts: PromptBuilderService,
  ) {}

  async analyze(transcript: string, dto: GenerateEmailDto): Promise<TranscriptAnalysis> {
    const value = await this.call(this.prompts.analysis(transcript, dto));
    const emailType = EMAIL_TYPES.includes(value.emailType)
      ? (value.emailType as EmailType)
      : 'other';
    const array = (input: unknown) =>
      Array.isArray(input) ? input.map(String).filter(Boolean) : [];
    return {
      language: String(value.language || dto.language || 'unknown'),
      intent: String(value.intent || 'email_draft'),
      emailType,
      recipient: String(value.recipient || dto.recipientName || ''),
      requestedAction: String(value.requestedAction || ''),
      people: array(value.people),
      company: String(value.company || ''),
      dates: array(value.dates),
      times: array(value.times),
      amounts: array(value.amounts),
      places: array(value.places),
      references: array(value.references),
      priority: ['low', 'normal', 'high', 'urgent'].includes(value.priority)
        ? value.priority
        : 'normal',
      detectedTone: String(value.detectedTone || 'professional'),
      formality: ['informal', 'neutral', 'formal'].includes(value.formality)
        ? value.formality
        : 'neutral',
      importantInformation: array(value.importantInformation),
      confidence: Math.max(0, Math.min(1, Number(value.confidence) || 0)),
    };
  }

  private async call(messages: unknown): Promise<any> {
    const key = this.config.get<string>('GROQ_API_KEY') || '';
    const model =
      this.config.get<string>('GROQ_ANALYSIS_MODEL') ||
      this.config.get<string>('GROQ_MODEL') ||
      'llama-3.3-70b-versatile';
    const response = await fetchWithTimeout(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0,
          top_p: 0.9,
          max_completion_tokens: 1200,
          response_format: { type: 'json_object' },
          messages,
        }),
      },
      { timeoutMs: 30_000, retries: 0, errorMessage: 'La génération IA a échoué. Réessayez.' },
    );
    if (!response.ok)
      throw new ServiceUnavailableException('La génération IA a échoué. Réessayez.');
    try {
      const json = (await response.json()) as any;
      return JSON.parse(json.choices?.[0]?.message?.content || '{}');
    } catch {
      throw new ServiceUnavailableException('La génération IA a échoué. Réessayez.');
    }
  }
}
