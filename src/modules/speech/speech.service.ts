import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  mapSpeechLanguageForProvider,
  isSupportedLanguageInput,
  normalizeLanguageCode,
  NormalizedSpeechLanguage,
  SupportedSpeechLanguage,
  unsupportedLanguageResponse,
} from './languageMap';
import { fetchWithTimeout } from '../../common/http/fetch-with-timeout';

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
  speechLanguageMode?: string;
  detectedSpeechLanguage?: NormalizedSpeechLanguage;
  confidence: number | null;
  duration: number;
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

  async transcribe(
    file: any,
    selectedLanguage = 'auto',
    context: { requestId?: string; actorId?: string } = {},
  ): Promise<TranscriptResponse> {
    const started = performance.now();
    const requestId = context.requestId || 'unknown';
    const mime = this.detectMime(file.buffer, this.normalizeMime(file.mimetype, file.originalname));
    const normalizedSelection = selectedLanguage.trim().toLowerCase() || 'auto';
    const deepgramLanguage = this.deepgramLanguageFor(normalizedSelection);
    const deepgramOptions = this.buildDeepgramOptions(deepgramLanguage);
    this.debug(
      JSON.stringify({
        event: 'stt_received',
        requestId,
        actorId: context.actorId,
        size: file.size ?? file.buffer?.length ?? 0,
        extension: String(file.originalname || '')
          .split('.')
          .pop(),
        declaredMime: file.mimetype || 'unknown',
        detectedMime: mime,
        requestedLanguage: normalizedSelection,
        providerLanguage: deepgramOptions.language,
        detectLanguage: deepgramOptions.detect_language,
        model: deepgramOptions.model,
      }),
    );

    if (!this.acceptedMime.has(mime)) {
      throw new BadRequestException('Format audio non supporté.');
    }

    const apiKey = this.config.get<string>('DEEPGRAM_API_KEY');
    if (!apiKey || apiKey.startsWith('REPLACE_WITH')) {
      throw new ServiceUnavailableException('Deepgram API key missing');
    }

    this.debug('Deepgram request started');
    const params = new URLSearchParams(deepgramOptions);

    const response = await fetchWithTimeout(
      `https://api.deepgram.com/v1/listen?${params.toString()}`,
      {
        method: 'POST',
        headers: { authorization: `Token ${apiKey}`, 'content-type': mime },
        body: file.buffer as unknown as BodyInit,
      },
      {
        timeoutMs: 15_000,
        retries: 1,
        retryStatuses: [429, 502, 503, 504],
        errorMessage: 'Deepgram transcription failed',
      },
    );

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(
        JSON.stringify({
          event: 'stt_provider_error',
          requestId,
          status: response.status,
          responseLength: body.length,
          deepgramMs: Math.round(performance.now() - started),
        }),
      );
      throw new ServiceUnavailableException({
        code: 'STT_PROVIDER_ERROR',
        message: 'La transcription est momentanément indisponible.',
        retryable: true,
        requestId,
      });
    }

    const json = (await response.json()) as DeepgramResponse;
    const normalized = this.normalizeDeepgram(json, deepgramLanguage ?? null);
    const finalLanguage =
      deepgramLanguage === undefined &&
      normalized.confidence !== null &&
      normalized.confidence < 0.55
        ? 'unknown'
        : normalized.language;
    const result = {
      ...normalized,
      language: finalLanguage,
      speechLanguageMode: normalizedSelection,
      detectedSpeechLanguage: finalLanguage,
    };
    this.debug(
      JSON.stringify({
        event: 'stt_completed',
        requestId,
        status: response.status,
        language: normalized.language,
        transcriptLength: normalized.transcript.length,
        confidence: normalized.confidence,
        duration: normalized.duration,
        deepgramMs: Math.round(performance.now() - started),
      }),
    );
    if (!result.transcript)
      throw new BadRequestException({
        code: 'STT_EMPTY_TRANSCRIPT',
        message: 'Le fournisseur a retourné une transcription vide.',
        retryable: true,
        requestId,
      });
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
      confidence: typeof alternative?.confidence === 'number' ? alternative.confidence : null,
      duration: json.metadata?.duration ?? 0,
    };
  }

  private buildDeepgramOptions(language?: SupportedSpeechLanguage): DeepgramOptions {
    // Whisper is the common denominator for automatic detection and every
    // language exposed by the mobile selector, including Arabic.
    const model = this.config.get<string>('DEEPGRAM_MODEL') || 'whisper';
    const options: DeepgramOptions = {
      model,
      smart_format: 'true',
      punctuate: 'true',
      paragraphs: 'true',
      utterances: 'false',
      diarize: 'false',
    };

    if (language) {
      return { ...options, language };
    }

    return { ...options, detect_language: 'true' };
  }

  private deepgramLanguageFor(language: string): SupportedSpeechLanguage | undefined {
    if (isSupportedLanguageInput(language) && language !== 'unknown') {
      return mapSpeechLanguageForProvider(language as import('./languageMap').SpeechLanguageMode);
    }
    throw new BadRequestException(unsupportedLanguageResponse);
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

  private detectMime(buffer: Buffer | undefined, _declaredMime: string) {
    if (!buffer || buffer.length < 4) throw new BadRequestException('Fichier audio vide.');
    const ascii = buffer.subarray(0, 12).toString('ascii');
    if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE') return 'audio/wav';
    if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'audio/webm';
    if (ascii.startsWith('ID3') || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
      return 'audio/mpeg';
    }
    if (ascii.slice(4, 8) === 'ftyp') return 'audio/mp4';
    throw new BadRequestException(
      'Le contenu du fichier ne correspond pas à un format audio supporté.',
    );
  }

  private debug(message: string) {
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.debug(message);
    }
  }
}
