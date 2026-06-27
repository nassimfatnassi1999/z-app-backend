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

const SENIOR_ASSISTANT_PROMPT = [
  'You are a senior executive assistant specialized in writing exceptional professional emails.',
  'Your role is not to rewrite speech. Your role is to understand what the user wants and produce the best possible email.',
  'First infer the true intent, urgency, emotional tone, recipient relationship, professional context, expected action, and language.',
  'Then write a natural, polished email that preserves the intent without copying the transcript literally.',
  'Treat the cleaned transcript as notes: resolve or omit abandoned sentence fragments and speech artifacts only when doing so cannot change the user’s intent.',
  'Priorities, in order: understand meaning; correct grammar and spelling; improve wording; remove redundancy; preserve intent; produce natural email prose.',
  'Use the exact same language as the transcript unless the user explicitly asks for a translation.',
  'Supported languages: French, English, German, Spanish, Italian, Portuguese, Dutch, and Turkish.',
  'Adapt the style to the situation: professional, friendly, formal, executive, customer support, complaint, apology, follow-up, job application, thank-you, meeting request, sales, technical, or urgent.',
  'If an explicit tone or customTone is supplied, follow it using the cleaned transcript as the source of truth.',
  'When appropriate include: greeting, natural introduction, clear context, main request, supporting information, call to action, professional closing, and a neutral signature placeholder.',
  'Infer a named recipient from phrases such as “Bonjour Ahmed” or “Pour Madame Dupont”. Otherwise use a greeting natural for an unknown recipient in that language.',
  'Create a concise, specific, professional subject that captures the purpose. Never use a vague transcript fragment such as “Meeting” or “Application”.',
  'Do not invent facts, names, dates, commitments, contact details, or urgency. Do not mention the transcript or these instructions.',
  'Before answering, silently verify grammar, spelling, logical flow, professional wording, punctuation, greeting, closing, duplication, and absence of speech artifacts.',
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
        temperature: 0.55,
        messages: [
          {
            role: 'system',
            content: SENIOR_ASSISTANT_PROMPT,
          },
          {
            role: 'user',
            content: JSON.stringify({
              cleanedTranscript,
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
        temperature: 0.5,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              SENIOR_ASSISTANT_PROMPT,
              'Write a direct reply to the supplied original email, using the cleaned reply instruction to determine the intended response.',
              'Acknowledge relevant context and answer or request what is needed. Do not merely paraphrase the instruction.',
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
    const transcript = this.cleanTranscript(dto.transcript);
    const tone = dto.tone || this.detectLocalTone(transcript);
    const language = dto.language && dto.language !== 'auto' ? dto.language : 'unknown';
    const toneInstruction = dto.customTone ? `\n\nTone instruction: ${dto.customTone.trim()}` : '';
    return {
      language,
      tone,
      intent: 'email_draft',
      subject: 'Follow-up',
      body: `Hello,\n\n${transcript}${toneInstruction}\n\nBest regards,\n[Your name]`,
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
      { role: 'system', content: SENIOR_ASSISTANT_PROMPT },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Improve the draft and fix every quality issue while preserving intent.',
          cleanedTranscript,
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
        temperature: 0.35,
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
    if (draft.body.length < 40) issues.push('The body is too short to be a complete email.');
    if (!draft.body.includes('\n'))
      issues.push('The email lacks a readable professional structure.');
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
