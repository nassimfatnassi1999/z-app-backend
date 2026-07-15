import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  languageMap,
  isSupportedLanguageInput,
  normalizeLanguageCode,
  NormalizedSpeechLanguage,
  SupportedSpeechLanguage,
  unsupportedLanguageResponse,
} from './languageMap';
import { fetchWithTimeout } from '../../common/http/fetch-with-timeout';
import { BusinessException } from '../../common/errors/business-error';

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
    const mime = this.detectMime(file.buffer, this.normalizeMime(file.mimetype, file.originalname));
    const normalizedSelection = selectedLanguage.trim().toLowerCase() || 'auto';
    const deepgramLanguage = this.deepgramLanguageFor(normalizedSelection);
    const deepgramOptions = this.buildDeepgramOptions(deepgramLanguage);
    const audioBytes = file.size ?? file.buffer?.length ?? 0;
    this.logger.log(
      `STT request received audioBytes=${audioBytes} mime=${mime} selectedLanguage=${normalizedSelection}`,
    );

    if (!this.acceptedMime.has(mime)) {
      this.fail('AUDIO_UNSUPPORTED', 'unsupported_format');
      throw new BusinessException(
        'AUDIO_UNSUPPORTED',
        'Le format de cet enregistrement n’est pas pris en charge.',
        true,
      );
    }

    const apiKey = this.config.get<string>('DEEPGRAM_API_KEY');
    if (!apiKey || apiKey.startsWith('REPLACE_WITH')) {
      this.fail('STT_PROVIDER_ERROR', 'provider_not_configured');
      throw new BusinessException(
        'STT_PROVIDER_ERROR',
        'Impossible de contacter le service de transcription.',
        true,
        503,
      );
    }

    const params = new URLSearchParams(deepgramOptions);

    let response: Response;
    try {
      response = await fetchWithTimeout(
        `https://api.deepgram.com/v1/listen?${params.toString()}`,
        {
          method: 'POST',
          headers: { authorization: `Token ${apiKey}`, 'content-type': mime },
          body: file.buffer as unknown as BodyInit,
        },
        { timeoutMs: 30_000, retries: 1, errorMessage: 'Deepgram transcription failed' },
      );
    } catch {
      this.fail('STT_PROVIDER_TIMEOUT', 'provider_timeout_or_network');
      throw new BusinessException(
        'STT_PROVIDER_TIMEOUT',
        'Le service de transcription met trop de temps à répondre.',
        true,
        504,
      );
    }

    if (!response.ok) {
      await response.body?.cancel();
      const isTimeout = response.status === 408 || response.status === 504;
      this.fail(
        isTimeout ? 'STT_PROVIDER_TIMEOUT' : 'STT_PROVIDER_ERROR',
        `provider_status_${response.status}`,
      );
      throw new BusinessException(
        isTimeout ? 'STT_PROVIDER_TIMEOUT' : 'STT_PROVIDER_ERROR',
        isTimeout
          ? 'Le service de transcription met trop de temps à répondre.'
          : 'Impossible de contacter le service de transcription.',
        true,
        isTimeout ? 504 : 503,
      );
    }

    const json = (await response.json()) as DeepgramResponse;
    const normalized = this.normalizeDeepgram(json, deepgramLanguage ?? null);
    const finalLanguage =
      deepgramLanguage === undefined && normalized.confidence < 0.55
        ? 'unknown'
        : normalized.language;
    if (normalized.transcript.length < 3) {
      this.fail('AUDIO_TOO_SILENT', 'transcript_too_short', normalized);
      throw new BusinessException(
        'AUDIO_TOO_SILENT',
        'Nous n’avons pas entendu suffisamment de voix pour créer votre email.',
        true,
      );
    }
    if (normalized.confidence < 0.35) {
      this.fail('STT_LOW_CONFIDENCE', 'confidence_below_threshold', normalized);
      throw new BusinessException('STT_LOW_CONFIDENCE', 'La qualité audio est insuffisante.', true);
    }
    const result = {
      ...normalized,
      language: finalLanguage,
      requiresConfirmation: normalized.confidence < 0.65,
      uncertainEntities: [],
    };
    this.logger.log(
      `STT completed durationSeconds=${normalized.duration} detectedLanguage=${normalized.language} averageConfidence=${normalized.confidence.toFixed(3)} transcriptChars=${normalized.transcript.length}`,
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
    const model = this.config.get<string>('DEEPGRAM_MODEL') || 'nova-2-general';
    const options: DeepgramOptions = {
      model,
      smart_format: 'true',
      punctuate: 'true',
      paragraphs: 'true',
      utterances: 'true',
      diarize: 'false',
    };

    if (language) {
      return { ...options, language };
    }

    return { ...options, detect_language: 'true' };
  }

  private deepgramLanguageFor(language: string): SupportedSpeechLanguage | undefined {
    if (isSupportedLanguageInput(language) && language !== 'unknown') {
      return languageMap[language];
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

  private detectMime(buffer: Buffer | undefined, declaredMime: string) {
    if (!buffer || buffer.length < 4) {
      this.fail('AUDIO_EMPTY', 'empty_audio');
      throw new BusinessException('AUDIO_EMPTY', 'Le fichier audio est vide.', true);
    }
    const ascii = buffer.subarray(0, 12).toString('ascii');
    if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE') return 'audio/wav';
    if (buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) return 'audio/webm';
    if (ascii.startsWith('ID3') || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)) {
      return 'audio/mpeg';
    }
    if (ascii.slice(4, 8) === 'ftyp')
      return declaredMime === 'audio/m4a' ? 'audio/m4a' : 'audio/mp4';
    this.fail('AUDIO_UNSUPPORTED', 'invalid_audio_signature');
    throw new BusinessException(
      'AUDIO_UNSUPPORTED',
      'Le contenu ne correspond pas à un format audio pris en charge.',
      true,
    );
  }

  private debug(message: string) {
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.debug(message);
    }
  }

  private fail(code: string, reason: string, result?: Partial<TranscriptResponse>) {
    this.logger.warn(
      `STT failed code=${code} reason=${reason} durationSeconds=${result?.duration ?? 0} detectedLanguage=${result?.language ?? 'unknown'} averageConfidence=${result?.confidence ?? 0}`,
    );
  }
}
