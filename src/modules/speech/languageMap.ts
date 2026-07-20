export type SupportedSpeechLanguage = 'fr' | 'en' | 'ar' | 'de' | 'es' | 'it' | 'pt' | 'nl' | 'tr';

export type SpeechLanguageMode = 'auto' | SupportedSpeechLanguage;

export type NormalizedSpeechLanguage = SupportedSpeechLanguage | 'unknown';

export const languageMap: Record<string, SupportedSpeechLanguage | undefined> = {
  auto: undefined,
  fr: 'fr',
  en: 'en',
  ar: 'ar',
  de: 'de',
  es: 'es',
  it: 'it',
  pt: 'pt',
  nl: 'nl',
  tr: 'tr',
};

export const supportedLanguageCodes = new Set<SupportedSpeechLanguage>(
  Object.values(languageMap).filter(Boolean) as SupportedSpeechLanguage[],
);

export const unsupportedLanguageResponse = {
  code: 'INVALID_LANGUAGE',
  message: 'Selected language is not supported.',
} as const;

export function isSupportedLanguageInput(language?: string | null): boolean {
  const normalized = language?.trim().toLowerCase() ?? '';
  return (
    normalized === '' ||
    normalized === 'auto' ||
    supportedLanguageCodes.has(normalized as SupportedSpeechLanguage)
  );
}

export function normalizeLanguageCode(language?: string | null): NormalizedSpeechLanguage {
  const normalized = language?.trim().toLowerCase().replace('_', '-') ?? '';
  const base = normalized.split('-')[0] as SupportedSpeechLanguage;
  return supportedLanguageCodes.has(base) ? base : 'unknown';
}

export function mapSpeechLanguageForProvider(
  language: SpeechLanguageMode,
): SupportedSpeechLanguage | undefined {
  return language === 'auto' ? undefined : languageMap[language];
}
