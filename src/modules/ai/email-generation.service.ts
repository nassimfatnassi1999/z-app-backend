import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithTimeout } from '../../common/http/fetch-with-timeout';
import { GenerateEmailDto } from './dto/generate-email.dto';
import { AIAnalysisService } from './ai-analysis.service';
import { GeneratedEmailResponse, TranscriptAnalysis } from './ai.types';
import { EmailValidationService } from './email-validation.service';
import { PromptBuilderService } from './prompt-builder.service';
import { TranscriptCleanerService } from './transcript-cleaner.service';

@Injectable()
export class EmailGenerationService {
  private readonly logger = new Logger(EmailGenerationService.name);
  constructor(
    private readonly config: ConfigService,
    private readonly cleaner: TranscriptCleanerService,
    private readonly analysis: AIAnalysisService,
    private readonly prompts: PromptBuilderService,
    private readonly validation: EmailValidationService,
  ) {}

  async generate(dto: GenerateEmailDto): Promise<GeneratedEmailResponse> {
    const transcript = this.cleaner.clean(dto.transcript);
    if (transcript.length < 3) throw new BadRequestException('Transcript is empty after cleaning');
    if (dto.tone === 'custom' && !dto.customTone?.trim())
      throw new BadRequestException('customTone is required when tone is custom');
    const key = this.config.get<string>('GROQ_API_KEY') || '';
    if (!key || key.startsWith('REPLACE_WITH'))
      throw new ServiceUnavailableException('La génération IA a échoué. Réessayez.');
    const analysis = await this.analysis.analyze(transcript, dto);
    let draft: GeneratedEmailResponse | null = null;
    let issues: string[] = [];
    try {
      draft = this.normalize(
        await this.call(key, this.prompts.generation(transcript, analysis, dto)),
        dto,
        analysis,
      );
      issues = this.validation.validate(draft, transcript, analysis);
    } catch {
      issues = ['Invalid generation JSON'];
    }
    if (draft && !issues.length) {
      this.log(draft, analysis, false);
      return draft;
    }
    try {
      const repaired = this.normalize(
        await this.call(key, this.prompts.repair(transcript, analysis, dto, draft, issues)),
        dto,
        analysis,
      );
      if (this.validation.validate(repaired, transcript, analysis).length)
        throw new Error('validation');
      this.log(repaired, analysis, true);
      return repaired;
    } catch {
      throw new ServiceUnavailableException('La génération IA a échoué. Réessayez.');
    }
  }

  private async call(key: string, messages: unknown): Promise<any> {
    const model = this.config.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';
    const response = await fetchWithTimeout(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.35,
          top_p: 0.9,
          max_completion_tokens: 2200,
          response_format: { type: 'json_object' },
          messages,
        }),
      },
      { timeoutMs: 30_000, retries: 0, errorMessage: 'La génération IA a échoué. Réessayez.' },
    );
    if (!response.ok) throw new Error('Groq request failed');
    const json = (await response.json()) as any;
    return JSON.parse(json.choices?.[0]?.message?.content || '{}');
  }

  private normalize(
    value: any,
    dto: GenerateEmailDto,
    analysis: TranscriptAnalysis,
  ): GeneratedEmailResponse {
    const subject = String(value.subject || '')
      .replace(/^(?:subject|objet)\s*:\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    const body = this.cleaner
      .clean(String(value.body || ''))
      .replace(/^```(?:json)?|```$/gim, '')
      .trim();
    return {
      language: String(value.language || analysis.language),
      tone: String(value.tone || dto.tone || analysis.detectedTone),
      intent: String(value.intent || analysis.intent),
      subject,
      body,
      suggestedRecipient: String(value.suggestedRecipient || analysis.recipient),
      confidence: analysis.confidence,
      emailType: analysis.emailType,
      detectedTone: analysis.detectedTone,
      detectedLanguage: analysis.language,
    };
  }

  private log(draft: GeneratedEmailResponse, analysis: TranscriptAnalysis, retry: boolean) {
    this.logger.log(
      `emailGenerated model=${this.config.get('GROQ_MODEL') || 'llama-3.3-70b-versatile'} type=${analysis.emailType} language=${analysis.language} tone=${analysis.detectedTone} confidence=${analysis.confidence.toFixed(2)} bodyLength=${draft.body.length} retryUsed=${retry}`,
    );
  }
}
