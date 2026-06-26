export type SupportedSpeechLanguage = 'fr' | 'en' | 'ar' | 'de' | 'es' | 'it' | 'pt' | 'nl' | 'tr';

export type NormalizedSpeechLanguage = SupportedSpeechLanguage | 'unknown';

export const languageMap: Record<string, SupportedSpeechLanguage | undefined> = {
  auto: undefined,
  fr: 'fr',
  french: 'fr',
  français: 'fr',
  francais: 'fr',
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
  español: 'es',
  it: 'it',
  italian: 'it',
  italien: 'it',
  italiano: 'it',
  pt: 'pt',
  portuguese: 'pt',
  portugais: 'pt',
  português: 'pt',
  nl: 'nl',
  dutch: 'nl',
  néerlandais: 'nl',
  neerlandais: 'nl',
  nederlands: 'nl',
  tr: 'tr',
  turkish: 'tr',
  turc: 'tr',
  türkçe: 'tr',
  turkce: 'tr',
};

export const supportedLanguageCodes = new Set<SupportedSpeechLanguage>(
  Object.values(languageMap).filter(Boolean) as SupportedSpeechLanguage[],
);

export function normalizeLanguageCode(language?: string | null): NormalizedSpeechLanguage {
  const normalized = language?.trim().toLowerCase() ?? '';
  const base = normalized.split('-')[0] as SupportedSpeechLanguage;
  return supportedLanguageCodes.has(base) ? base : 'unknown';
}
