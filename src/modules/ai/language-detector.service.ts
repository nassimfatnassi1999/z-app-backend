import { Injectable } from '@nestjs/common';
import {
  EmailLanguageSelection,
  LanguageAnalysis,
  PipelineContext,
  SupportedEmailLanguage,
} from './ai.types';
import { LanguageNormalizerService } from './language-normalizer.service';

@Injectable()
export class LanguageDetectorService {
  constructor(private readonly normalizer: LanguageNormalizerService) {}

  analyze(context: PipelineContext): LanguageAnalysis {
    const transcriptLanguage = this.detectTranscriptLanguage(
      context.transcript,
      context.transcriptLanguage,
    );
    const selected = this.normalizer.normalize(context.selectedOutputLanguage, 'auto');
    const requested =
      selected !== 'auto' ? selected : this.detectRequestedLanguage(context.transcript);
    const outputLanguage = this.chooseOutputLanguage(selected, requested, transcriptLanguage);

    return {
      transcriptLanguage,
      requestedOutputLanguage: requested,
      outputLanguage,
      confidence: this.confidence(transcriptLanguage, requested, context.transcript),
    };
  }

  detectRequestedLanguage(transcript: string): EmailLanguageSelection {
    const normalized = this.normalizer.clean(transcript);
    for (const [code, phrases] of Object.entries(languageRequestPhrases)) {
      if (phrases.some((phrase) => normalized.includes(this.normalizer.clean(phrase)))) {
        return code as SupportedEmailLanguage;
      }
    }

    for (const language of supportedRequestOrder) {
      const names = this.normalizer.aliasesFor(language).join('|');
      const pattern = new RegExp(`\\b(in|en|auf)\\s+(${names})\\b`, 'u');
      if (pattern.test(normalized)) return language;
    }
    return 'auto';
  }

  private detectTranscriptLanguage(transcript: string, provided?: string): EmailLanguageSelection {
    const normalizedProvided = this.normalizer.normalize(provided, 'unknown');
    if (normalizedProvided !== 'unknown' && normalizedProvided !== 'auto')
      return normalizedProvided;

    const normalized = this.normalizer.clean(transcript);
    if (/[\u0600-\u06ff]/.test(transcript)) return 'ar';

    const scores = Object.entries(languageSignals).map(([language, signals]) => ({
      language: language as SupportedEmailLanguage,
      score: signals.filter((signal) => normalized.includes(signal)).length,
    }));
    scores.sort((a, b) => b.score - a.score);
    return scores[0]?.score ? scores[0].language : 'unknown';
  }

  private chooseOutputLanguage(
    selected: EmailLanguageSelection,
    requested: EmailLanguageSelection,
    transcriptLanguage: EmailLanguageSelection,
  ): SupportedEmailLanguage {
    if (this.normalizer.isSupported(selected)) return selected;
    if (this.normalizer.isSupported(requested)) return requested;
    if (this.normalizer.isSupported(transcriptLanguage)) return transcriptLanguage;
    return 'en';
  }

  private confidence(
    transcriptLanguage: EmailLanguageSelection,
    requested: EmailLanguageSelection,
    transcript: string,
  ) {
    let score = transcript.trim().length > 20 ? 75 : 55;
    if (transcriptLanguage !== 'unknown') score += 10;
    if (requested !== 'auto') score += 10;
    return Math.min(score, 95);
  }
}

const supportedRequestOrder: SupportedEmailLanguage[] = [
  'fr',
  'en',
  'ar',
  'de',
  'es',
  'it',
  'pt',
  'nl',
  'tr',
];

const languageRequestPhrases: Record<SupportedEmailLanguage, string[]> = {
  fr: ['en français', 'in french', 'بالفرنسية'],
  en: ['en anglais', 'in english', 'بالانجليزية', 'بالإنجليزية'],
  ar: ['en arabe', 'in arabic', 'بالعربية'],
  de: ['en allemand', 'in german', 'auf deutsch', 'بالالمانية', 'بالألمانية'],
  es: ['en espagnol', 'in spanish', 'بالاسبانية', 'بالإسبانية'],
  it: ['en italien', 'in italian', 'بالايطالية', 'بالإيطالية'],
  pt: ['en portugais', 'in portuguese', 'بالبرتغالية'],
  nl: ['en néerlandais', 'en neerlandais', 'in dutch', 'بالهولندية'],
  tr: ['en turc', 'in turkish', 'بالتركية'],
};

const languageSignals: Record<SupportedEmailLanguage, string[]> = {
  fr: ['bonjour', 'je veux', 'envoyer', 'demain', 'rendez-vous', 'merci'],
  en: ['hello', 'i want', 'write', 'meeting', 'next week', 'thank'],
  ar: [],
  de: ['hallo', 'ich mochte', 'termin', 'danke', 'nachste'],
  es: ['hola', 'quiero', 'correo', 'reunion', 'gracias'],
  it: ['ciao', 'vorrei', 'scrivere', 'appuntamento', 'grazie'],
  pt: ['ola', 'quero', 'reuniao', 'obrigado', 'profissional'],
  nl: ['hallo', 'ik wil', 'afspraak', 'bedankt'],
  tr: ['merhaba', 'istiyorum', 'toplanti', 'tesekkur'],
};
