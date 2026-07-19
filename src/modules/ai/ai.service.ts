import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenerateEmailDto } from './dto/generate-email.dto';
import { GenerateReplyDto } from './dto/generate-reply.dto';
import { isSupportedLanguageInput, unsupportedLanguageResponse } from '../speech/languageMap';
import { fetchWithTimeout } from '../../common/http/fetch-with-timeout';
import { AiOrchestratorService } from './services/ai-orchestrator.service';

type GeneratedEmailResponse = {
  language: string;
  tone: string;
  intent: string;
  subject: string;
  body: string;
  suggestedRecipient: string;
};

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

const REFORMULATION_RULES = [
  'You are a senior executive assistant. Transform the supplied transcript into a complete, polished professional email while preserving its exact meaning and original intent.',
  'The supplied user text is the only source of factual information.',
  'Do not invent or infer names, dates, reasons, commitments, deadlines, relationships, urgency, contact details, events, actions, or any other unsupported detail.',
  'Do not add information absent from the supplied user text.',
  'When information is missing, omit it. Never fill a gap with neutral filler or an assumption.',
  'Understand the user intent and improve grammar, spelling, clarity, and structure. Remove speech artifacts and repetition only when meaning is unchanged.',
  'Generate a complete email body, not a summary, fragment, keyword list, or raw transcript.',
  'Never add a greeting, thanks, apology, request, action, availability, or well-wish that was not explicitly spoken.',
  'Keep the result concise but complete. Do not expand short input into a long email.',
  'Use the same language as the transcript unless the user explicitly requests a translation.',
  `When tone is auto or omitted, analyze the meaning and classify the dominant tone or intention as exactly one of: ${DETECTABLE_TONES.join(', ')}. Use that classification to write the email, and return it in the tone field.`,
  'Interpret professional as neutral workplace communication, administrative as institutional or procedural, business as commercial or client-oriented, student as academic communication, friendly as warm and conversational, urgent as time-sensitive, formal as ceremonious or highly respectful, direct as short and action-oriented, apology as acknowledging fault or inconvenience, follow_up as a reminder or status check, complaint as reporting dissatisfaction or a problem, and information_request as asking for facts or clarification.',
  'Base the classification on meaning and context, not on isolated keywords. Otherwise respect the requested tone without changing facts or intent.',
  'When tone is custom, follow customTone as a writing-style instruction while still preserving every fact and the original intent.',
  'Only a neutral closing is allowed when it introduces no person, fact, promise, or unsupported detail.',
].join(' ');

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
    private readonly orchestrator: AiOrchestratorService,
  ) {}

  async generateEmail(dto: GenerateEmailDto): Promise<GeneratedEmailResponse> {
    this.assertSupportedLanguage(dto.language);
    if (dto.tone === 'custom' && !dto.customTone?.trim()) {
      throw new BadRequestException('customTone is required when tone is custom');
    }
    const result = await this.orchestrator.compose({
      transcript: dto.transcript,
      language: dto.language,
      tone: dto.tone === 'custom' ? dto.customTone : dto.tone,
      previousEmail: dto.currentBody,
    });
    return {
      language: result.email.detectedLanguage,
      tone: result.email.detectedTone,
      intent: result.email.emailIntent,
      subject: result.email.subject,
      body: result.email.body,
      suggestedRecipient: result.email.recipient,
    };
  }

  async generateReply(dto: GenerateReplyDto) {
    this.assertSupportedLanguage(dto.language);
    const subject = /^re:/i.test(dto.originalEmail.subject.trim())
      ? dto.originalEmail.subject.trim()
      : `Re: ${dto.originalEmail.subject.trim()}`;
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    const model = this.legacyModel();
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
      this.groqEndpoint(),
      {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: [
                REFORMULATION_RULES,
                'Write a direct reply using the reply instruction as the sole source for claims made on behalf of the user.',
                'The original email is context only. Do not invent an answer to any question that the reply instruction does not answer.',
                'Return ONLY JSON: {"subject":"...","body":"...","tone":"...","language":"..."}.',
                'Do not quote or append the original email and do not use markdown.',
              ].join(' '),
            },
            {
              role: 'user',
              content: JSON.stringify({
                originalEmail: dto.originalEmail,
                cleanedReplyInstruction: cleanedInstruction,
                language: dto.language,
                tone,
                customTone: dto.customTone,
                expectedSubject: subject,
              }),
            },
          ],
        }),
      },
      { timeoutMs: this.requestTimeout(), retries: 0, errorMessage: GENERATION_FAILED_MESSAGE },
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
      this.groqEndpoint(),
      {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: [
                REFORMULATION_RULES,
                'Write a complete professional reply. The original email is context only and the reply instruction is the sole source for claims made on behalf of the user.',
                'Do not quote or append the original email.',
                'Return ONLY JSON: {"subject":"...","body":"...","tone":"...","language":"..."}.',
              ].join(' '),
            },
            {
              role: 'user',
              content: JSON.stringify({
                task: REPAIR_INSTRUCTION,
                originalEmail: dto.originalEmail,
                cleanedReplyInstruction: cleanedInstruction,
                expectedSubject: subject,
                requestedTone: dto.tone || 'auto',
                customTone: dto.customTone,
                previousReply,
                qualityIssues: issues,
              }),
            },
          ],
        }),
      },
      { timeoutMs: this.requestTimeout(), retries: 0, errorMessage: GENERATION_FAILED_MESSAGE },
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

  private groqEndpoint() {
    const baseUrl = this.config.get<string>('GROQ_BASE_URL') || 'https://api.groq.com/openai/v1';
    return `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  }

  private requestTimeout() {
    const configured = Number(this.config.get<string>('AI_REQUEST_TIMEOUT_MS'));
    return Number.isFinite(configured) && configured >= 1_000 ? configured : 30_000;
  }

  private legacyModel() {
    return (
      this.config.get<string>('GROQ_MODEL') ||
      this.config.get<string>('GROQ_EMAIL_MODEL') ||
      'llama-3.3-70b-versatile'
    );
  }

  private assertSupportedLanguage(language?: string) {
    if (!isSupportedLanguageInput(language)) {
      throw new BadRequestException(unsupportedLanguageResponse);
    }
  }
}
