import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenerateEmailDto } from './dto/generate-email.dto';
import { GenerateReplyDto } from './dto/generate-reply.dto';
import { ExpandEmailDto } from './dto/expand-email.dto';
import { isSupportedLanguageInput, unsupportedLanguageResponse } from '../speech/languageMap';
import { fetchWithTimeout } from '../../common/http/fetch-with-timeout';
import { EmailGenerationService } from './email-generation.service';
import { GeneratedEmailResponse } from './ai.types';
import { resolveGroqModels } from '../../config/ai-models';
import { PromptBuilderService } from './prompt-builder.service';

const DETECTABLE_TONES = [
  'professional',
  'administrative',
  'business',
  'student',
  'friendly',
  'urgent',
  'formal',
  'direct',
  'apology',
  'follow_up',
  'complaint',
  'information_request',
] as const;

const REPAIR_INSTRUCTION =
  'The previous output was not a complete professional email. Generate a complete email with subject and body. Do not summarize. Do not paste the transcript. Return valid JSON only.';

const GENERATION_FAILED_MESSAGE = 'La génération IA a échoué. Réessayez.';

export interface AiProvider {
  generateEmail(dto: GenerateEmailDto): Promise<GeneratedEmailResponse>;
}

@Injectable()
export class AiService implements AiProvider {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly emailGeneration: EmailGenerationService,
    private readonly prompts: PromptBuilderService = new PromptBuilderService(),
  ) {}

  async generateEmail(dto: GenerateEmailDto, userId?: string): Promise<GeneratedEmailResponse> {
    this.assertSupportedLanguage(dto.language);
    return this.emailGeneration.generate(dto, userId);
  }

  async expandEmail(dto: ExpandEmailDto): Promise<{ email: string }> {
    this.assertSupportedLanguage(dto.language);
    const email = dto.email.trim();
    if (email.length < 3) throw new BadRequestException('Email is empty');

    const apiKey = this.config.get<string>('GROQ_API_KEY');
    const model = resolveGroqModels(this.config).primary;
    if (!apiKey || apiKey.startsWith('REPLACE_WITH')) {
      throw new ServiceUnavailableException(GENERATION_FAILED_MESSAGE);
    }

    const level = dto.expandLevel || 'medium';
    const targetGrowth = { light: 'about 20%', medium: 'about 50%', full: 'about 100%' }[level];
    this.logger.log(
      `provider=groq model=${model} emailLength=${email.length} tone=${dto.tone || 'auto'} type=expand level=${level}`,
    );
    const response = await fetchWithTimeout(
      `${this.config.get<string>('GROQ_BASE_URL', 'https://api.groq.com/openai/v1')}/chat/completions`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.15,
          response_format: { type: 'json_object' },
          messages: this.prompts.build('email-rewrite.v1', {
            editedDraft: { body: email },
            userEditedFields: ['body'],
            rewriteInstruction: `Apply target enrichment ${level} (${targetGrowth}) without adding facts.`,
            tone: dto.tone || 'auto',
            language: dto.language || 'unknown',
          }),
        }),
      },
      { timeoutMs: 30_000, retries: 0, errorMessage: GENERATION_FAILED_MESSAGE },
    );
    if (!response.ok) throw new ServiceUnavailableException(GENERATION_FAILED_MESSAGE);

    try {
      const json = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const value = this.parseJson(json.choices?.[0]?.message?.content || '{}');
      const expanded = this.polishBody(String(value.email || ''));
      if (!expanded || expanded.length <= email.length) {
        throw new Error('Expanded email is not longer than its source');
      }
      this.logger.log(`generatedBodyLength=${expanded.length} type=expand level=${level}`);
      return { email: expanded };
    } catch {
      throw new ServiceUnavailableException(GENERATION_FAILED_MESSAGE);
    }
  }

  async generateReply(dto: GenerateReplyDto) {
    this.assertSupportedLanguage(dto.language);
    const subject = /^re:/i.test(dto.originalEmail.subject.trim())
      ? dto.originalEmail.subject.trim()
      : `Re: ${dto.originalEmail.subject.trim()}`;
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    const model = resolveGroqModels(this.config).primary;
    const tone = dto.tone || 'auto';
    const cleanedInstruction = this.cleanTranscript(dto.replyInstruction);
    if (!cleanedInstruction) {
      throw new BadRequestException('Reply instruction is empty after cleaning');
    }
    this.logger.log(
      `provider=groq model=${model} transcriptLength=${cleanedInstruction.length} tone=${tone} type=reply`,
    );
    if (!apiKey || apiKey.startsWith('REPLACE_WITH')) {
      throw new ServiceUnavailableException(GENERATION_FAILED_MESSAGE);
    }
    const response = await fetchWithTimeout(
      `${this.config.get<string>('GROQ_BASE_URL', 'https://api.groq.com/openai/v1')}/chat/completions`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: this.prompts.build('email-rewrite.v1', {
            sourceContext: { originalEmail: dto.originalEmail },
            editedDraft: null,
            userEditedFields: [],
            rewriteInstruction: cleanedInstruction,
            language: dto.language,
            tone,
            customTone: dto.customTone,
            expectedSubject: subject,
          }),
        }),
      },
      { timeoutMs: 30_000, retries: 0, errorMessage: GENERATION_FAILED_MESSAGE },
    );
    if (!response.ok) throw new ServiceUnavailableException(GENERATION_FAILED_MESSAGE);
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    try {
      const value = this.parseJson(json.choices?.[0]?.message?.content || '{}');
      const reply = {
        subject,
        body: this.polishBody(String(value.body || '')),
        tone: this.normalizeTone(value.tone || tone),
        language: String(value.language || dto.language || 'auto'),
      };
      const issues = this.replyQualityIssues(reply.body, cleanedInstruction);
      if (issues.length === 0) {
        this.logger.log(`generatedBodyLength=${reply.body.length} retryUsed=no type=reply`);
        return reply;
      }
      return this.repairReply(apiKey, model, dto, subject, cleanedInstruction, reply, issues);
    } catch {
      return this.repairReply(apiKey, model, dto, subject, cleanedInstruction, null, [
        'The response was not valid JSON.',
      ]);
    }
  }

  private async repairReply(
    apiKey: string,
    model: string,
    dto: GenerateReplyDto,
    subject: string,
    cleanedInstruction: string,
    previousReply: { subject: string; body: string; tone: string; language: string } | null,
    issues: string[],
  ) {
    const response = await fetchWithTimeout(
      `${this.config.get<string>('GROQ_BASE_URL', 'https://api.groq.com/openai/v1')}/chat/completions`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: this.prompts.build('email-repair.v1', {
            sourceContext: {
              originalEmail: dto.originalEmail,
              cleanedReplyInstruction: cleanedInstruction,
            },
            invalidDraft: previousReply,
            blockingIssues: issues,
            expectedSubject: subject,
            requestedTone: dto.tone || 'auto',
            customTone: dto.customTone,
            task: REPAIR_INSTRUCTION,
          }),
        }),
      },
      { timeoutMs: 30_000, retries: 0, errorMessage: GENERATION_FAILED_MESSAGE },
    );
    if (!response.ok) throw new ServiceUnavailableException(GENERATION_FAILED_MESSAGE);
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    try {
      const value = this.parseJson(json.choices?.[0]?.message?.content || '{}');
      const repaired = {
        subject,
        body: this.polishBody(String(value.body || '')),
        tone: this.normalizeTone(value.tone || dto.tone),
        language: String(value.language || dto.language || 'auto'),
      };
      if (this.replyQualityIssues(repaired.body, cleanedInstruction).length > 0) {
        throw new Error('Repaired reply failed validation');
      }
      this.logger.log(`generatedBodyLength=${repaired.body.length} retryUsed=yes type=reply`);
      return repaired;
    } catch {
      throw new ServiceUnavailableException(GENERATION_FAILED_MESSAGE);
    }
  }

  private cleanTranscript(input: string) {
    let value = input.normalize('NFKC');
    value = value.replace(
      /\[(?:noise|music|silence|inaudible|bruit|musique|silence|inaudible)\]/gi,
      ' ',
    );
    value = value.replace(/\((?:noise|music|silence|inaudible|bruit|musique)\)/gi, ' ');
    value = value.replace(/\b(?:e+u+h+|euh+|heu+|hum+|hmm+|um+|uh+|erm+)\b[,.…]?/gi, ' ');
    value = value.replace(/\b([\p{L}\p{N}'’-]+)(?:\s+\1\b)+/giu, '$1');
    value = value.replace(
      /\b((?:[\p{L}\p{N}'’-]+\s+){1,5}[\p{L}\p{N}'’-]+)(?:[\s,;:–—-]+\1\b)+/giu,
      '$1',
    );
    value = value.replace(/\s+([,.;:!?])/g, '$1');
    value = value.replace(/([,;:!?])(?=\S)/g, '$1 ');
    value = value.replace(/[ \t]{2,}/g, ' ');
    value = value.replace(/\n[ \t]+/g, '\n');
    value = value.replace(/\n{3,}/g, '\n\n').trim();
    return value.replace(/(^|[.!?]\s+)([\p{Ll}])/gu, (_, start: string, letter: string) => {
      return `${start}${letter.toLocaleUpperCase()}`;
    });
  }

  private polishBody(body: string) {
    const cleaned = this.cleanTranscript(body)
      .replace(/^```(?:json)?|```$/gim, '')
      .trim();
    const paragraphs = cleaned.split(/\n{2,}/);
    const seen = new Set<string>();
    return paragraphs
      .filter((paragraph) => {
        const key = paragraph.toLocaleLowerCase().replace(/\W/gu, '');
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join('\n\n');
  }

  private replyQualityIssues(body: string, instruction: string) {
    const issues: string[] = [];
    if (!body) issues.push('The reply body is empty.');
    if (this.normalizeForComparison(body) === this.normalizeForComparison(instruction)) {
      issues.push('The reply body is the raw transcript.');
    }
    const minimumBodyLength = Math.min(160, Math.max(35, Math.floor(instruction.length * 0.8)));
    if (body.length < minimumBodyLength) {
      issues.push('The reply body is too short.');
    }
    const sentences = body
      .split(/[.!?]+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 12);
    if (instruction.length >= 35 && sentences.length <= 1 && body.length < 110) {
      issues.push('The reply body is only one short sentence.');
    }
    return issues;
  }

  private normalizeForComparison(value: string) {
    return value
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  private parseJson(content: string): any {
    try {
      return JSON.parse(content);
    } catch {
      throw new ServiceUnavailableException('Groq returned invalid JSON');
    }
  }

  private normalizeTone(value?: string) {
    const tone = String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[\s-]+/g, '_');
    if (tone === 'custom') return tone;
    const allowed = new Set<string>(DETECTABLE_TONES);
    return allowed.has(tone) ? tone : 'professional';
  }

  private assertSupportedLanguage(language?: string) {
    if (!isSupportedLanguageInput(language)) {
      throw new BadRequestException(unsupportedLanguageResponse);
    }
  }
}
