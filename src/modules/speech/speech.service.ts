import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  languageMap,
  isSupportedLanguageInput,
  normalizeLanguageCode,
  NormalizedSpeechLanguage,
  SupportedSpeechLanguage,
  unsupportedLanguageResponse,
} from './languageMap';
import { BusinessException } from '../../common/errors/business-error';
import { randomUUID } from 'crypto';

type DeepgramResponse = {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        confidence?: number;
        languages?: string[];
        detected_language?: string;
      }>;
      detected_language?: string;
      language_confidence?: number;
    }>;
  };
  metadata?: {
    detected_language?: string;
    duration?: number;
  };
};

type TranscriptResponse = {
  transcript: string;
  language: NormalizedSpeechLanguage;
  confidence: number;
  duration: number;
  requiresConfirmation: boolean;
  uncertainEntities: string[];
};

type DeepgramOptions = Record<string, string>;

export interface SpeechProvider {
  transcribe(file: any, selectedLanguage?: string): Promise<TranscriptResponse>;
}

@Injectable()
export class SpeechService implements SpeechProvider {
  private readonly logger = new Logger(SpeechService.name);
  private readonly acceptedMime = new Set([
    'audio/m4a',
    'audio/mp4',
    'audio/wav',
    'audio/webm',
    'audio/mpeg',
    'audio/mp3',
  ]);

  constructor(private readonly config: ConfigService) {}

  async transcribe(file: any, selectedLanguage = 'auto'): Promise<TranscriptResponse> {
    const requestId = randomUUID();
    const startedAt = Date.now();
    const normalizedSelection =
      typeof selectedLanguage === 'string'
        ? selectedLanguage.trim().toLowerCase() || 'auto'
        : '__invalid__';
    const deepgramLanguage = this.deepgramLanguageFor(normalizedSelection);
    const mime = this.detectMime(file.buffer, this.normalizeMime(file.mimetype, file.originalname));
    const audioBytes = file.size ?? file.buffer?.length ?? 0;
    this.logger.log(
      `requestId=${requestId} event=stt_started audioBytes=${audioBytes} mime=${mime} selectedLanguage=${normalizedSelection}`,
    );

    if (!this.acceptedMime.has(mime)) {
      this.fail(requestId, 'AUDIO_INVALID', 'unsupported_format');
      throw new BusinessException(
        'AUDIO_INVALID',
        'Le format de cet enregistrement n’est pas pris en charge.',
        false,
      );
    }

    const apiKey = this.config.get<string>('DEEPGRAM_API_KEY');
    if (!apiKey || apiKey.startsWith('REPLACE_WITH')) {
      this.fail(requestId, 'PROVIDER_UNAVAILABLE', 'provider_not_configured');
      throw new BusinessException(
        'PROVIDER_UNAVAILABLE',
        'Impossible de contacter le service de transcription.',
        true,
        503,
      );
    }

    const deadline = startedAt + 35_000;
    const primaryOptions = this.buildDeepgramOptions(deepgramLanguage);
    let normalized: TranscriptResponse;
    let fallbackUsed = false;
    try {
      normalized = await this.requestDeepgram(
        apiKey,
        mime,
        file.buffer,
        primaryOptions,
        deepgramLanguage ?? null,
        deadline,
      );
      if (this.needsQualityFallback(normalized)) {
        fallbackUsed = true;
        normalized = await this.requestDeepgram(
          apiKey,
          mime,
          file.buffer,
          this.buildFallbackOptions(deepgramLanguage),
          deepgramLanguage ?? null,
          deadline,
        );
      }
    } catch (error) {
      if (error instanceof BusinessException && error.getStatus() < 500) throw error;
      if (Date.now() >= deadline) {
        this.fail(requestId, 'TIMEOUT', 'global_timeout');
        throw new BusinessException(
          'TIMEOUT',
          'La transcription prend trop de temps. Réessayez.',
          true,
          504,
        );
      }
      if (!fallbackUsed) {
        fallbackUsed = true;
        try {
          normalized = await this.requestDeepgram(
            apiKey,
            mime,
            file.buffer,
            primaryOptions,
            deepgramLanguage ?? null,
            deadline,
          );
        } catch (retryError) {
          throw this.providerFailure(requestId, retryError, deadline);
        }
      } else {
        throw this.providerFailure(requestId, error, deadline);
      }
    }

    if (normalized.duration > 0 && normalized.duration < 1) {
      this.fail(requestId, 'AUDIO_TOO_SHORT', 'duration_below_one_second', normalized);
      throw new BusinessException('AUDIO_TOO_SHORT', 'L’enregistrement est trop court.', true);
    }
    const finalLanguage = deepgramLanguage
      ? deepgramLanguage
      : normalized.confidence < 0.55
        ? 'unknown'
        : normalized.language;
    if (normalized.transcript.length < 3) {
      this.fail(requestId, 'NO_SPEECH', 'transcript_too_short', normalized);
      throw new BusinessException(
        'NO_SPEECH',
        'Nous n’avons pas entendu suffisamment de voix pour créer votre email.',
        true,
      );
    }
    if (normalized.confidence < 0.35) {
      this.fail(requestId, 'LOW_CONFIDENCE', 'confidence_below_threshold', normalized);
      throw new BusinessException('LOW_CONFIDENCE', 'La qualité audio est insuffisante.', true);
    }
    const result = {
      ...normalized,
      language: finalLanguage,
      requiresConfirmation: normalized.confidence < 0.65,
      uncertainEntities: [],
    };
    this.logger.log(
      `requestId=${requestId} event=stt_completed durationMs=${Date.now() - startedAt} audioBytes=${audioBytes} mime=${mime} audioDurationSeconds=${normalized.duration} detectedLanguage=${normalized.language} averageConfidence=${normalized.confidence.toFixed(3)} transcriptChars=${normalized.transcript.length} fallbackUsed=${fallbackUsed}`,
    );
    return result;
  }

  private normalizeDeepgram(
    json: DeepgramResponse,
    selectedLanguage: SupportedSpeechLanguage | null,
  ): TranscriptResponse {
    const channel = json.results?.channels?.[0];
    const alternative = channel?.alternatives?.[0];
    const language =
      alternative?.detected_language ??
      alternative?.languages?.[0] ??
      channel?.detected_language ??
      json.metadata?.detected_language ??
      selectedLanguage ??
      'unknown';
    return {
      transcript: alternative?.transcript?.trim() ?? '',
      language: normalizeLanguageCode(language),
      confidence: alternative?.confidence ?? 0,
      duration: json.metadata?.duration ?? 0,
      requiresConfirmation: false,
      uncertainEntities: [],
    };
  }

  private buildDeepgramOptions(language?: SupportedSpeechLanguage): DeepgramOptions {
    const model = this.config.get<string>('DEEPGRAM_MODEL') || 'nova-3';
    const options: DeepgramOptions = {
      model,
      smart_format: 'true',
      punctuate: 'true',
      paragraphs: 'true',
      numerals: 'true',
    };

    if (language) {
      return { ...options, language };
    }

    return { ...options, detect_language: 'true' };
  }

  private buildFallbackOptions(language?: SupportedSpeechLanguage): DeepgramOptions {
    return this.buildDeepgramOptions(language);
  }

  private needsQualityFallback(result: TranscriptResponse) {
    return result.transcript.length < 3 || result.confidence < 0.35;
  }

  private async requestDeepgram(
    apiKey: string,
    mime: string,
    buffer: Buffer,
    options: DeepgramOptions,
    selectedLanguage: SupportedSpeechLanguage | null,
    deadline: number,
  ) {
    const remainingMs = Math.min(20_000, deadline - Date.now());
    if (remainingMs <= 0) throw new DOMException('Global timeout', 'AbortError');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remainingMs);
    try {
      const response = await fetch(
        `https://api.deepgram.com/v1/listen?${new URLSearchParams(options).toString()}`,
        {
          method: 'POST',
          headers: { authorization: `Token ${apiKey}`, 'content-type': mime },
          body: buffer as unknown as BodyInit,
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        if ([408, 429, 500, 502, 503, 504].includes(response.status)) {
          throw new Error(`retryable_provider_status_${response.status}`);
        }
        throw new BusinessException(
          'PROVIDER_UNAVAILABLE',
          'Le service de transcription a refusé cet enregistrement.',
          false,
          503,
        );
      }
      return this.normalizeDeepgram((await response.json()) as DeepgramResponse, selectedLanguage);
    } finally {
      clearTimeout(timer);
    }
  }

  private providerFailure(requestId: string, error: unknown, deadline: number) {
    const timedOut =
      Date.now() >= deadline || (error instanceof DOMException && error.name === 'AbortError');
    const networkError = !timedOut && error instanceof TypeError;
    const code = timedOut ? 'TIMEOUT' : networkError ? 'NETWORK_ERROR' : 'PROVIDER_UNAVAILABLE';
    this.fail(
      requestId,
      code,
      timedOut ? 'provider_timeout' : networkError ? 'network_error' : 'provider_unavailable',
    );
    return new BusinessException(
      code,
      timedOut
        ? 'La transcription prend trop de temps. Réessayez.'
        : networkError
          ? 'Connexion au service de transcription impossible.'
          : 'Le service de transcription est temporairement indisponible.',
      true,
      timedOut ? 504 : 503,
    );
  }

  private deepgramLanguageFor(language: string): SupportedSpeechLanguage | undefined {
    if (isSupportedLanguageInput(language)) {
      return languageMap[language];
    }
    throw new BusinessException(
      unsupportedLanguageResponse.code,
      unsupportedLanguageResponse.message,
      false,
    );
  }

  private normalizeMime(mimetype = '', filename = '') {
    if (mimetype && mimetype !== 'application/octet-stream') {
      return mimetype.toLowerCase();
    }

    const lower = filename.toLowerCase();
    if (lower.endsWith('.m4a')) return 'audio/m4a';
    if (lower.endsWith('.mp4')) return 'audio/mp4';
    if (lower.endsWith('.wav')) return 'audio/wav';
    if (lower.endsWith('.webm')) return 'audio/webm';
    if (lower.endsWith('.mp3') || lower.endsWith('.mpeg')) return 'audio/mpeg';
    return mimetype.toLowerCase();
  }

  private detectMime(buffer: Buffer | undefined, declaredMime: string) {
    if (!buffer || buffer.length < 4) {
      this.fail('unknown', 'AUDIO_EMPTY', 'empty_audio');
      throw new BusinessException('AUDIO_EMPTY', 'Le fichier audio est vide.', false);
    }
    const ascii = buffer.subarray(0, 12).toString('ascii');
    if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE') return 'audio/wav';
    if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'audio/webm';
    if (ascii.startsWith('ID3') || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
      return 'audio/mpeg';
    }
    if (ascii.slice(4, 8) === 'ftyp')
      return declaredMime === 'audio/m4a' ? 'audio/m4a' : 'audio/mp4';
    this.fail('unknown', 'AUDIO_INVALID', 'invalid_audio_signature');
    throw new BusinessException(
      'AUDIO_INVALID',
      'Le contenu ne correspond pas à un format audio pris en charge.',
      false,
    );
  }

  private fail(
    requestId: string,
    code: string,
    reason: string,
    result?: Partial<TranscriptResponse>,
  ) {
    this.logger.warn(
      `requestId=${requestId} event=stt_failed code=${code} reason=${reason} audioDurationSeconds=${result?.duration ?? 0} detectedLanguage=${result?.language ?? 'unknown'} averageConfidence=${result?.confidence ?? 0}`,
    );
  }
}
