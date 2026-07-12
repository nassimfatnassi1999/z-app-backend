import { SpeechLanguageMode, normalizeLanguageCode } from '../speech/languageMap';

const outputLanguagePatterns: Array<{ regex: RegExp; language: string }> = [
  { regex: /\b(?:en français|en langue française|in french)\b/i, language: 'fr' },
  { regex: /\b(?:en anglais|en langue anglaise|in english)\b/i, language: 'en' },
  { regex: /\b(?:en allemand|in german)\b/i, language: 'de' },
  { regex: /\b(?:en espagnol|in spanish)\b/i, language: 'es' },
  { regex: /\b(?:en arabe|in arabic)\b/i, language: 'ar' },
  { regex: /(?:باللغة الفرنسية|بالفرنسية)/i, language: 'fr' },
  { regex: /(?:باللغة الإنجليزية|بالإنجليزية)/i, language: 'en' },
];

export interface VoiceLanguageContext {
  speechLanguageMode: SpeechLanguageMode;
  detectedSpeechLanguage?: string;
  requestedOutputLanguage?: string;
  effectiveOutputLanguage: string;
}

export function detectRequestedOutputLanguage(transcript: string): string | undefined {
  return outputLanguagePatterns.find(({ regex }) => regex.test(transcript))?.language;
}

function knownLanguage(language?: string): string | undefined {
  const normalized = normalizeLanguageCode(language);
  return normalized === 'unknown' ? undefined : normalized;
}

export function resolveEffectiveOutputLanguage(params: {
  requestedOutputLanguage?: string;
  transcriptRequestedLanguage?: string;
  detectedSpeechLanguage?: string;
  speechLanguageMode: SpeechLanguageMode;
  appLanguage?: string;
}): string {
  return (
    knownLanguage(params.requestedOutputLanguage) ??
    knownLanguage(params.transcriptRequestedLanguage) ??
    knownLanguage(params.appLanguage) ??
    knownLanguage(params.detectedSpeechLanguage) ??
    (params.speechLanguageMode !== 'auto' ? params.speechLanguageMode : undefined) ??
    'en'
  );
}
