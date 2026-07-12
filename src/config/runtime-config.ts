export type SttLanguageStrategy = 'auto' | 'forced';

export function parseStrictBoolean(value: unknown, name = 'value'): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be exactly "true" or "false"`);
}

export function parseBoundedNumber(
  value: unknown,
  name: string,
  options: { min: number; max: number; integer?: boolean },
): number {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${name} is required`);
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || (options.integer && !Number.isInteger(parsed))) {
    throw new Error(`${name} must be ${options.integer ? 'an integer' : 'a number'}`);
  }
  if (parsed < options.min || parsed > options.max) {
    throw new Error(`${name} must be between ${options.min} and ${options.max}`);
  }
  return parsed;
}

export function parseHttpUrl(value: unknown, name: string): string {
  const text = String(value ?? '').trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${name} must be a valid HTTP(S) URL`);
  }
  return url.toString().replace(/\/$/, '');
}

export interface AiRuntimeConfig {
  groq: {
    baseUrl: string;
    analysisModel: string;
    generationModel: string;
    fallbackModel?: string;
    timeoutMs: number;
    maxRetries: number;
    analysisTemperature: number;
    generationTemperature: number;
    repairTemperature: number;
    maxOutputTokens: number;
    enableRepair: boolean;
  };
  deepgram: {
    baseUrl: string;
    model: string;
    languageStrategy: SttLanguageStrategy;
    defaultLanguage?: string;
    timeoutMs: number;
    maxRetries: number;
    enableLanguageRetry: boolean;
    maxAudioSizeBytes: number;
    minAudioDurationMs: number;
    maxAudioDurationSeconds: number;
  };
}
