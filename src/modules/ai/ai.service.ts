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

type GeneratedEmailResponse = {
  language: string;
  tone: string;
  intent: string;
  subject: string;
  body: string;
  suggestedRecipient: string;
};

type GroqMessage = { role: 'system' | 'user'; content: string };

const EMAIL_JSON_SHAPE =
  '{"language":"...","tone":"...","intent":"...","subject":"...","body":"...","suggestedRecipient":"..."}';

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
  'When information is missing, use neutral phrasing or omit it. Never fill a gap with an assumption.',
  'Understand the user intent and improve grammar, spelling, clarity, and structure. Remove speech artifacts and repetition only when meaning is unchanged.',
  'Generate a complete email body, not a summary, fragment, keyword list, or raw transcript.',
  'Include a suitable greeting, context, request or action, and closing when appropriate, without inventing a recipient name or sender identity.',
  'Keep the result concise but complete. Do not expand short input into a long email.',
  'Use the same language as the transcript unless the user explicitly requests a translation.',
  `When tone is auto or omitted, analyze the meaning and classify the dominant tone or intention as exactly one of: ${DETECTABLE_TONES.join(', ')}. Use that classification to write the email, and return it in the tone field.`,
  'Interpret professional as neutral workplace communication, administrative as institutional or procedural, business as commercial or client-oriented, student as academic communication, friendly as warm and conversational, urgent as time-sensitive, formal as ceremonious or highly respectful, direct as short and action-oriented, apology as acknowledging fault or inconvenience, follow_up as a reminder or status check, complaint as reporting dissatisfaction or a problem, and information_request as asking for facts or clarification.',
  'Base the classification on meaning and context, not on isolated keywords. Otherwise respect the requested tone without changing facts or intent.',
  'When tone is custom, follow customTone as a writing-style instruction while still preserving every fact and the original intent.',
  'A generic greeting or closing is allowed only if it introduces no person, fact, promise, or unsupported detail.',
].join(' ');

const EMAIL_REFORMULATION_PROMPT = [
  REFORMULATION_RULES,
  'The transcript is the source of truth. The current body is the editing target, but remove or neutralize every detail that is not supported by the transcript.',
  'Do not add any information absent from the transcript.',
  'Create a short, factual subject based only on the supplied text.',
  'The subject and body must be fully written, useful email content. Never return only a few transcript words.',
  'Before answering, silently verify that every factual detail is supported by the transcript or current body.',
  `Return ONLY valid JSON with exactly this shape: ${EMAIL_JSON_SHAPE}`,
  'No markdown and no explanations.',
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

  constructor(private readonly config: ConfigService) {}

  async generateEmail(dto: GenerateEmailDto): Promise<GeneratedEmailResponse> {
    this.assertSupportedLanguage(dto.language);
    const cleanedTranscript = this.cleanTranscript(dto.transcript);
    if (cleanedTranscript.length < 3) {
      throw new BadRequestException('Transcript is empty after cleaning');
    }
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    const model = this.config.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';
    const selectedTone = dto.tone || 'auto';
    if (selectedTone === 'custom' && !dto.customTone?.trim()) {
      throw new BadRequestException('customTone is required when tone is custom');
    }
    this.logger.log(
      `provider=groq model=${model} transcriptLength=${cleanedTranscript.length} tone=${selectedTone}`,
    );
    if (!apiKey || apiKey.startsWith('REPLACE_WITH')) {
      throw new ServiceUnavailableException(GENERATION_FAILED_MESSAGE);
    }

    const response = await fetchWithTimeout(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            {
              role: 'system',
              content: EMAIL_REFORMULATION_PROMPT,
            },
            {
              role: 'user',
              content: JSON.stringify({
                cleanedTranscript,
                currentBody: dto.currentBody,
                tone: selectedTone,
                customTone: dto.customTone?.trim(),
                template: dto.template || dto.templateKey,
                language: dto.language,
              }),
            },
          ],
          response_format: { type: 'json_object' },
        }),
      },
      { timeoutMs: 30_000, retries: 0, errorMessage: GENERATION_FAILED_MESSAGE },
    );

    if (!response.ok) {
      throw new ServiceUnavailableException(GENERATION_FAILED_MESSAGE);
    }

    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content || '{}';
    let draft: GeneratedEmailResponse | null = null;
    let issues: string[];
    try {
      draft = this.normalizeDraft(this.parseJson(content), dto);
      issues = this.qualityIssues(draft, cleanedTranscript);
    } catch {
      issues = ['The response was not valid JSON.'];
    }
    if (draft && issues.length === 0) {
      this.logger.log(`generatedBodyLength=${draft.body.length} retryUsed=no`);
      return draft;
    }

    return this.repairDraft(apiKey, model, dto, cleanedTranscript, draft, issues);
  }

  async expandEmail(dto: ExpandEmailDto): Promise<{ email: string }> {
    this.assertSupportedLanguage(dto.language);
    const email = dto.email.trim();
    if (email.length < 3) throw new BadRequestException('Email is empty');

    const apiKey = this.config.get<string>('GROQ_API_KEY');
    const model = this.config.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';
    if (!apiKey || apiKey.startsWith('REPLACE_WITH')) {
      throw new ServiceUnavailableException(GENERATION_FAILED_MESSAGE);
    }

    const level = dto.expandLevel || 'medium';
    const targetGrowth = { light: 'about 20%', medium: 'about 50%', full: 'about 100%' }[level];
    this.logger.log(
      `provider=groq model=${model} emailLength=${email.length} tone=${dto.tone || 'auto'} type=expand level=${level}`,
    );
    const response = await fetchWithTimeout(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.15,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: [
                'You are an expert business email writer.',
                `Expand the supplied email by ${targetGrowth} into a richer, more natural, and more professional version.`,
                'Use the supplied email as the only source of information.',
                'Preserve exactly the same intent, facts, language, recipient, and requested tone.',
                'Never invent, infer, alter, or remove facts. Never change names, dates, amounts, places, commitments, or the main subject.',
                'Only develop ideas already present, improve clarity and wording, and add natural transitions.',
                'Generic connective wording is allowed only when it adds no new factual claim.',
                'Return only valid JSON with exactly this shape: {"email":"..."}. No markdown or explanation.',
              ].join(' '),
            },
            {
              role: 'user',
              content: JSON.stringify({
                email,
                tone: dto.tone || 'auto',
                language: dto.language || 'unknown',
                expansionLevel: level,
              }),
            },
          ],
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
    const model = this.config.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';
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
      'https://api.groq.com/openai/v1/chat/completions',
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
      'https://api.groq.com/openai/v1/chat/completions',
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

  private normalizeDraft(value: any, dto: GenerateEmailDto): GeneratedEmailResponse {
    return {
      language: String(value.language || dto.language || 'unknown'),
      tone: this.normalizeTone(value.tone || dto.tone),
      intent: String(value.intent || 'email_draft'),
      subject: this.polishSubject(String(value.subject || '')),
      body: this.polishBody(String(value.body || '')),
      suggestedRecipient: String(value.suggestedRecipient || ''),
    };
  }

  private async repairDraft(
    apiKey: string,
    model: string,
    dto: GenerateEmailDto,
    cleanedTranscript: string,
    draft: GeneratedEmailResponse | null,
    issues: string[],
  ) {
    const messages: GroqMessage[] = [
      { role: 'system', content: EMAIL_REFORMULATION_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          task: REPAIR_INSTRUCTION,
          cleanedTranscript,
          currentBody: dto.currentBody,
          requestedTone: dto.tone,
          customTone: dto.customTone,
          draft,
          qualityIssues: issues,
        }),
      },
    ];
    const response = await fetchWithTimeout(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages,
          response_format: { type: 'json_object' },
        }),
      },
      { timeoutMs: 30_000, retries: 0, errorMessage: GENERATION_FAILED_MESSAGE },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(GENERATION_FAILED_MESSAGE);
    }
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    try {
      const repaired = this.normalizeDraft(
        this.parseJson(json.choices?.[0]?.message?.content || '{}'),
        dto,
      );
      if (this.qualityIssues(repaired, cleanedTranscript).length > 0) {
        throw new Error('Repaired output failed validation');
      }
      this.logger.log(`generatedBodyLength=${repaired.body.length} retryUsed=yes`);
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

  private polishSubject(subject: string) {
    return subject
      .replace(/^(?:subject|objet)\s*:\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
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

  private qualityIssues(draft: GeneratedEmailResponse, transcript: string) {
    const issues: string[] = [];
    if (!draft.subject) issues.push('The subject is empty.');
    else if (draft.subject.length < 6 || draft.subject.split(/\s+/).length < 2)
      issues.push('The subject is vague or too short.');
    if (draft.subject.length > 100) issues.push('The subject is too long.');
    if (!draft.body) issues.push('The body is empty.');
    const normalizedBody = this.normalizeForComparison(draft.body);
    const normalizedTranscript = this.normalizeForComparison(transcript);
    if (normalizedBody && normalizedBody === normalizedTranscript) {
      issues.push('The body is the raw transcript.');
    }
    const minimumBodyLength = Math.min(180, Math.max(40, Math.floor(transcript.length * 0.85)));
    if (draft.body.length < minimumBodyLength) {
      issues.push('The body is too short compared with the transcript.');
    }
    if (/\b(?:euh|heu|hum|hmm|um|uh|erm)\b/i.test(draft.body)) {
      issues.push('Speech fillers remain in the body.');
    }
    const sentences = draft.body
      .split(/[.!?]+/)
      .map((sentence) => sentence.trim().toLocaleLowerCase())
      .filter((sentence) => sentence.length > 12);
    if (new Set(sentences).size !== sentences.length) {
      issues.push('The body contains duplicated sentences.');
    }
    if (transcript.length >= 35 && sentences.length <= 1 && draft.body.length < 120) {
      issues.push('The body is only one short sentence.');
    }
    return issues;
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
