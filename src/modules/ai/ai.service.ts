import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenerateEmailDto } from './dto/generate-email.dto';
import { GenerateReplyDto } from './dto/generate-reply.dto';
import { isSupportedLanguageInput, unsupportedLanguageResponse } from '../speech/languageMap';

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

const REFORMULATION_RULES = [
  'Reformulate the supplied text as a concise, professional email while preserving its exact meaning and original intent.',
  'The supplied user text is the only source of factual information.',
  'Do not invent or infer names, dates, reasons, commitments, deadlines, relationships, urgency, contact details, events, actions, or any other unsupported detail.',
  'Do not add information absent from the supplied user text.',
  'When information is missing, use neutral phrasing or omit it. Never fill a gap with an assumption.',
  'Improve grammar, spelling, clarity, and structure only. Remove speech artifacts and repetition only when meaning is unchanged.',
  'Keep the result concise. Do not expand short input into a long email.',
  'Use the same language as the transcript unless the user explicitly requests a translation.',
  'Respect the requested tone when supplied, without changing facts or intent.',
  'A generic greeting or closing is allowed only if it introduces no person, fact, promise, or unsupported detail.',
].join(' ');

const EMAIL_REFORMULATION_PROMPT = [
  REFORMULATION_RULES,
  'The transcript is the source of truth. The current body is the editing target, but remove or neutralize every detail that is not supported by the transcript.',
  'Do not add any information absent from the transcript.',
  'Create a short, factual subject based only on the supplied text.',
  'Before answering, silently verify that every factual detail is supported by the transcript or current body.',
  `Return ONLY valid JSON with exactly this shape: ${EMAIL_JSON_SHAPE}`,
  'No markdown and no explanations.',
].join(' ');

export interface AiProvider {
  generateEmail(dto: GenerateEmailDto): Promise<GeneratedEmailResponse>;
}

@Injectable()
export class AiService implements AiProvider {
  constructor(private readonly config: ConfigService) {}

  async generateEmail(dto: GenerateEmailDto): Promise<GeneratedEmailResponse> {
    this.assertSupportedLanguage(dto.language);
    const cleanedTranscript = this.cleanTranscript(dto.transcript);
    if (cleanedTranscript.length < 3) {
      throw new BadRequestException('Transcript is empty after cleaning');
    }
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    const model = this.config.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';
    if (!apiKey || apiKey.startsWith('REPLACE_WITH')) {
      return this.localDraft(dto);
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
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
              tone: dto.tone,
              customTone: dto.customTone,
              template: dto.template || dto.templateKey,
              language: dto.language,
            }),
          },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException('Groq email generation failed');
    }

    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content || '{}';
    const draft = this.normalizeDraft(this.parseJson(content), dto);
    const issues = this.qualityIssues(draft);
    if (issues.length === 0) return draft;

    return this.repairDraft(apiKey, model, dto, cleanedTranscript, draft, issues);
  }

  async generateReply(dto: GenerateReplyDto) {
    this.assertSupportedLanguage(dto.language);
    const subject = /^re:/i.test(dto.originalEmail.subject.trim())
      ? dto.originalEmail.subject.trim()
      : `Re: ${dto.originalEmail.subject.trim()}`;
    const apiKey = this.config.get<string>('GROQ_API_KEY');
    const tone = dto.tone || 'professional';
    const cleanedInstruction = this.cleanTranscript(dto.replyInstruction);
    if (!cleanedInstruction) {
      throw new BadRequestException('Reply instruction is empty after cleaning');
    }
    if (!apiKey || apiKey.startsWith('REPLACE_WITH')) {
      return {
        subject,
        body: cleanedInstruction,
        tone,
        language: dto.language || 'auto',
        provider: 'local-placeholder',
      };
    }
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.config.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile',
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
              tone: dto.tone,
              expectedSubject: subject,
            }),
          },
        ],
      }),
    });
    if (!response.ok) throw new ServiceUnavailableException('Groq reply generation failed');
    const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const value = this.parseJson(json.choices?.[0]?.message?.content || '{}');
    return {
      subject,
      body: this.polishBody(String(value.body || cleanedInstruction)),
      tone: this.normalizeTone(value.tone || tone),
      language: String(value.language || dto.language || 'auto'),
    };
  }

  private localDraft(dto: GenerateEmailDto): GeneratedEmailResponse & { provider: string } {
    const transcript = this.cleanTranscript(dto.currentBody || dto.transcript);
    const tone = dto.tone || this.detectLocalTone(transcript);
    const language = dto.language && dto.language !== 'auto' ? dto.language : 'unknown';
    return {
      language,
      tone,
      intent: 'email_draft',
      subject: '',
      body: transcript,
      suggestedRecipient: '',
      provider: 'local-placeholder',
    };
  }

  private normalizeDraft(value: any, dto: GenerateEmailDto): GeneratedEmailResponse {
    return {
      language: String(value.language || dto.language || 'unknown'),
      tone: this.normalizeTone(value.tone || dto.tone),
      intent: String(value.intent || 'email_draft'),
      subject: this.polishSubject(String(value.subject || 'Votre e-mail')),
      body: this.polishBody(String(value.body || '')),
      suggestedRecipient: String(value.suggestedRecipient || ''),
    };
  }

  private async repairDraft(
    apiKey: string,
    model: string,
    dto: GenerateEmailDto,
    cleanedTranscript: string,
    draft: GeneratedEmailResponse,
    issues: string[],
  ) {
    const messages: GroqMessage[] = [
      { role: 'system', content: EMAIL_REFORMULATION_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Improve the draft and fix every quality issue while preserving intent.',
          cleanedTranscript,
          currentBody: dto.currentBody,
          requestedTone: dto.tone,
          customTone: dto.customTone,
          draft,
          qualityIssues: issues,
        }),
      },
    ];
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages,
        response_format: { type: 'json_object' },
      }),
    });
    if (!response.ok) return draft;
    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return this.normalizeDraft(this.parseJson(json.choices?.[0]?.message?.content || '{}'), dto);
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

  private qualityIssues(draft: GeneratedEmailResponse) {
    const issues: string[] = [];
    if (draft.subject.length < 6 || draft.subject.split(/\s+/).length < 2) {
      issues.push('The subject is vague or too short.');
    }
    if (draft.subject.length > 100) issues.push('The subject is too long.');
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
    return issues;
  }

  private parseJson(content: string): any {
    try {
      return JSON.parse(content);
    } catch {
      throw new ServiceUnavailableException('Groq returned invalid JSON');
    }
  }

  private normalizeTone(value?: string) {
    const tone = String(value || '').toLowerCase();
    const allowed = new Set([
      'professional',
      'administrative',
      'friendly',
      'student',
      'formal',
      'business',
    ]);
    return allowed.has(tone) ? tone : 'professional';
  }

  private assertSupportedLanguage(language?: string) {
    if (!isSupportedLanguageInput(language)) {
      throw new BadRequestException(unsupportedLanguageResponse);
    }
  }

  private detectLocalTone(transcript: string) {
    const lower = transcript.toLowerCase();
    if (lower.includes('stage') || lower.includes('student')) return 'student';
    if (lower.includes('administration') || lower.includes('document')) return 'administrative';
    if (lower.includes('cher') || lower.includes('hello')) return 'friendly';
    return 'professional';
  }
}
