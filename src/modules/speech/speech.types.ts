import { NormalizedSpeechLanguage, SupportedSpeechLanguage } from './languageMap';

export type SttLanguageStrategy = 'auto' | 'forced';
export interface TranscriptionOptions {
  strategy: SttLanguageStrategy;
  requestedLanguage?: SupportedSpeechLanguage;
  model: string;
  smartFormat: boolean;
  punctuation: boolean;
}
export interface TranscriptionResult {
  transcript: string;
  language: NormalizedSpeechLanguage;
  detectedLanguage?: NormalizedSpeechLanguage;
  transcriptionConfidence?: number;
  languageDetectionConfidence?: number;
  provider: 'deepgram';
  model: string;
  durationMs?: number;
}
export interface RequestContext { requestId?: string; actorId?: string }
export interface SpeechToTextProvider {
  transcribe(audio: Buffer, options: TranscriptionOptions, context: RequestContext): Promise<TranscriptionResult>;
}
export const SPEECH_TO_TEXT_PROVIDER = Symbol('SPEECH_TO_TEXT_PROVIDER');
