import { normalizeLanguageCode, SupportedSpeechLanguage } from './languageMap';
import { TranscriptionResult } from './speech.types';

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {};
const firstObject = (value: unknown): JsonObject => Array.isArray(value) ? object(value[0]) : {};

export function mapDeepgramResponse(
  payload: unknown,
  model: string,
  requestedLanguage?: SupportedSpeechLanguage,
): TranscriptionResult {
  const root = object(payload);
  const metadata = object(root.metadata);
  const channel = firstObject(object(root.results).channels);
  const alternative = firstObject(channel.alternatives);
  const languages = Array.isArray(alternative.languages) ? alternative.languages : [];
  const detected =
    alternative.detected_language ?? languages[0] ?? channel.detected_language ?? metadata.detected_language;
  const language = normalizeLanguageCode(String(detected ?? requestedLanguage ?? 'unknown'));
  const confidence = typeof alternative.confidence === 'number' ? alternative.confidence : undefined;
  const duration = typeof metadata.duration === 'number' ? metadata.duration * 1000 : undefined;
  return {
    transcript: typeof alternative.transcript === 'string' ? alternative.transcript.trim() : '',
    language,
    detectedLanguage: detected ? language : undefined,
    transcriptionConfidence: confidence,
    languageDetectionConfidence: undefined,
    provider: 'deepgram',
    model,
    durationMs: duration,
  };
}
