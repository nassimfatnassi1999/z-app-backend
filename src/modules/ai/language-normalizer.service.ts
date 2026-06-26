import { Injectable } from '@nestjs/common';
import {
  EmailLanguageSelection,
  SupportedEmailLanguage,
  supportedEmailLanguages,
} from './ai.types';

@Injectable()
export class LanguageNormalizerService {
  private readonly aliases: Record<string, SupportedEmailLanguage> = {
    fr: 'fr',
    french: 'fr',
    francais: 'fr',
    français: 'fr',
    en: 'en',
    english: 'en',
    anglais: 'en',
    ar: 'ar',
    arabic: 'ar',
    arabe: 'ar',
    العربية: 'ar',
    de: 'de',
    german: 'de',
    allemand: 'de',
    deutsch: 'de',
    es: 'es',
    spanish: 'es',
    espagnol: 'es',
    espanol: 'es',
    español: 'es',
    it: 'it',
    italian: 'it',
    italien: 'it',
    italiano: 'it',
    pt: 'pt',
    portuguese: 'pt',
    portugais: 'pt',
    portugues: 'pt',
    português: 'pt',
    nl: 'nl',
    dutch: 'nl',
    neerlandais: 'nl',
    néerlandais: 'nl',
    nederlands: 'nl',
    tr: 'tr',
    turkish: 'tr',
    turc: 'tr',
    turkce: 'tr',
    türkçe: 'tr',
  };

  normalize(value?: string | null, fallback: EmailLanguageSelection = 'unknown') {
    const clean = this.clean(value);
    if (!clean) return fallback;
    if (clean === 'auto') return 'auto';
    return this.aliases[clean] ?? fallback;
  }

  normalizeRequired(value?: string | null, fallback: SupportedEmailLanguage = 'en') {
    const normalized = this.normalize(value, fallback);
    return this.isSupported(normalized) ? normalized : fallback;
  }

  isSupported(value: string): value is SupportedEmailLanguage {
    return supportedEmailLanguages.includes(value as SupportedEmailLanguage);
  }

  languageName(language: SupportedEmailLanguage) {
    return languageNames[language];
  }

  aliasesFor(language: SupportedEmailLanguage) {
    return Object.entries(this.aliases)
      .filter(([, code]) => code === language)
      .map(([alias]) => alias);
  }

  clean(value?: string | null) {
    return (value ?? '')
      .trim()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  }
}

export const languageNames: Record<SupportedEmailLanguage, string> = {
  fr: 'French',
  en: 'English',
  ar: 'Arabic',
  de: 'German',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  tr: 'Turkish',
};
