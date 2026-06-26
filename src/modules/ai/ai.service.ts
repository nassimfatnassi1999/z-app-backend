import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GenerateEmailDto } from './dto/generate-email.dto';

type GeneratedEmailResponse = {
  language: string;
  tone: string;
  intent: string;
  subject: string;
  body: string;
  suggestedRecipient: string;
};

export interface AiProvider {
  generateEmail(dto: GenerateEmailDto): Promise<GeneratedEmailResponse>;
}

@Injectable()
export class AiService implements AiProvider {
  constructor(private readonly config: ConfigService) {}

  async generateEmail(dto: GenerateEmailDto): Promise<GeneratedEmailResponse> {
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
        temperature: 0.4,
        messages: [
          {
            role: 'system',
            content: [
              'You are Z, an AI assistant that turns voice transcripts into ready-to-send emails.',
              'Analyze the transcript and detect language, tone, intent, subject, body, and suggested recipient when possible.',
              'Generate the email in the SAME language as the transcript unless the user explicitly requested another language. Never translate automatically.',
              'Allowed tones: professional, administrative, friendly, student, formal, business.',
              'If a tone is provided by the user, use it. Otherwise choose the best tone automatically.',
              'If customTone is provided, follow that custom tone instruction and choose the closest allowed tone label for the tone field.',
              'Return ONLY valid JSON with this exact shape: {"language":"...","tone":"...","intent":"...","subject":"...","body":"...","suggestedRecipient":"..."}',
              'No markdown. No explanations.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              transcript: dto.transcript,
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
    return this.normalizeDraft(JSON.parse(content), dto);
  }

  private localDraft(dto: GenerateEmailDto): GeneratedEmailResponse & { provider: string } {
    const tone = dto.tone || this.detectLocalTone(dto.transcript);
    const language = dto.language && dto.language !== 'auto' ? dto.language : 'unknown';
    const toneInstruction = dto.customTone ? `\n\nTone instruction: ${dto.customTone.trim()}` : '';
    return {
      language,
      tone,
      intent: 'email_draft',
      subject: 'Follow-up',
      body: `Hello,\n\n${dto.transcript.trim()}${toneInstruction}\n\nBest regards,`,
      suggestedRecipient: '',
      provider: 'local-placeholder',
    };
  }

  private normalizeDraft(value: any, dto: GenerateEmailDto): GeneratedEmailResponse {
    return {
      language: String(value.language || dto.language || 'unknown'),
      tone: this.normalizeTone(value.tone || dto.tone),
      intent: String(value.intent || 'email_draft'),
      subject: String(value.subject || 'Votre e-mail'),
      body: String(value.body || ''),
      suggestedRecipient: String(value.suggestedRecipient || ''),
    };
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

  private detectLocalTone(transcript: string) {
    const lower = transcript.toLowerCase();
    if (lower.includes('stage') || lower.includes('student')) return 'student';
    if (lower.includes('administration') || lower.includes('document')) return 'administrative';
    if (lower.includes('cher') || lower.includes('hello')) return 'friendly';
    return 'professional';
  }
}
