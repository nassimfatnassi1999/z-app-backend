import { Injectable } from '@nestjs/common';
import {
  EmailPlan,
  GeneratedEmailResponse,
  SupportedEmailLanguage,
  ValidationResult,
} from './ai.types';

@Injectable()
export class EmailValidatorService {
  validate(email: GeneratedEmailResponse, plan: EmailPlan): ValidationResult {
    const errors: string[] = [];
    if (!email.subject?.trim()) errors.push('missing_subject');
    if (!email.body?.trim()) errors.push('missing_body');
    if (email.subject?.length > 100) errors.push('subject_too_long');
    if ((email.body ?? '').length < 50) errors.push('body_too_short');
    if (email.outputLanguage !== plan.language) errors.push('wrong_language_code');
    if (!this.hasClosing(email.body, plan.language)) errors.push('missing_closing');
    if (!this.hasGreeting(email.body, plan.language)) errors.push('missing_greeting');
    if (!this.looksLikeLanguage(email.body, plan.language)) errors.push('wrong_language_text');
    if (this.hallucinatedRecipient(email, plan)) errors.push('hallucinated_recipient');

    return {
      valid: errors.length === 0,
      errors,
      confidencePenalty: errors.length * 8,
    };
  }

  private hasGreeting(body: string, language: SupportedEmailLanguage) {
    return languageMarkers[language].greetings.some((marker) =>
      body.toLowerCase().includes(marker.toLowerCase()),
    );
  }

  private hasClosing(body: string, language: SupportedEmailLanguage) {
    return languageMarkers[language].closings.some((marker) =>
      body.toLowerCase().includes(marker.toLowerCase()),
    );
  }

  private looksLikeLanguage(body: string, language: SupportedEmailLanguage) {
    if (language === 'ar') return /[\u0600-\u06ff]/.test(body);
    if (/[\u0600-\u06ff]/.test(body)) return false;
    const lower = body.toLowerCase();
    return languageMarkers[language].signals.some((signal) => lower.includes(signal));
  }

  private hallucinatedRecipient(email: GeneratedEmailResponse, plan: EmailPlan) {
    if (!email.recipient || !plan.recipient) return false;
    return email.recipient.toLowerCase() !== plan.recipient.toLowerCase();
  }
}

const languageMarkers: Record<
  SupportedEmailLanguage,
  { greetings: string[]; closings: string[]; signals: string[] }
> = {
  fr: {
    greetings: ['bonjour', 'madame', 'monsieur'],
    closings: ['cordialement', 'salutations'],
    signals: ['vous', 'je', 'nous', 'cordialement'],
  },
  en: {
    greetings: ['dear', 'hello'],
    closings: ['regards', 'sincerely', 'best'],
    signals: ['the', 'you', 'would', 'regards'],
  },
  ar: {
    greetings: ['مرحباً', 'مرحبا', 'السيد', 'السيدة'],
    closings: ['مع خالص', 'تحياتي', 'وتفضلوا'],
    signals: ['أود', 'يرجى', 'شكراً', 'تحياتي'],
  },
  de: {
    greetings: ['sehr geehrte', 'hallo', 'guten tag'],
    closings: ['mit freundlichen grüßen', 'freundliche grüße'],
    signals: ['ich', 'sie', 'bitte', 'danke'],
  },
  es: {
    greetings: ['estimado', 'estimada', 'hola'],
    closings: ['atentamente', 'saludos cordiales'],
    signals: ['usted', 'solicitar', 'gracias', 'atentamente'],
  },
  it: {
    greetings: ['gentile', 'buongiorno', 'ciao'],
    closings: ['cordiali saluti', 'distinti saluti'],
    signals: ['vorrei', 'lei', 'grazie', 'saluti'],
  },
  pt: {
    greetings: ['prezado', 'prezada', 'olá'],
    closings: ['atenciosamente', 'cumprimentos'],
    signals: ['gostaria', 'você', 'obrigado', 'atenciosamente'],
  },
  nl: {
    greetings: ['geachte', 'beste', 'hallo'],
    closings: ['met vriendelijke groet', 'vriendelijke groeten'],
    signals: ['ik', 'u', 'graag', 'bedankt'],
  },
  tr: {
    greetings: ['sayın', 'merhaba'],
    closings: ['saygılarımla', 'iyi çalışmalar'],
    signals: ['siz', 'rica', 'teşekkür', 'saygılarımla'],
  },
};
