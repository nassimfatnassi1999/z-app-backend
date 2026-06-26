import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  languageMap,
  normalizeLanguageCode,
  NormalizedSpeechLanguage,
  SupportedSpeechLanguage,
} from './languageMap';

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
    const mime = this.normalizeMime(file.mimetype, file.originalname);
    const normalizedSelection = selectedLanguage.trim().toLowerCase() || 'auto';
    const deepgramLanguage = this.deepgramLanguageFor(normalizedSelection);
    const deepgramOptions = this.buildDeepgramOptions(deepgramLanguage);
    this.debug(`received file mime: ${file.mimetype || 'unknown'} -> ${mime}`);
    this.debug(`received file size: ${file.size ?? file.buffer?.length ?? 0}`);
    this.debug(`selected speech language: ${normalizedSelection}`);
    this.debug(`Deepgram language: ${deepgramLanguage ?? 'auto-detect'}`);
    this.debug(`Deepgram options: ${JSON.stringify(deepgramOptions)}`);

    if (!this.acceptedMime.has(mime)) {
      throw new BadRequestException('Format audio non supporté.');
    }

    const apiKey = this.config.get<string>('DEEPGRAM_API_KEY');
    if (!apiKey || apiKey.startsWith('REPLACE_WITH')) {
      throw new ServiceUnavailableException('Deepgram API key missing');
    }

    this.debug('Deepgram request started');
    const params = new URLSearchParams(deepgramOptions);

    const response = await fetch(`https://api.deepgram.com/v1/listen?${params.toString()}`, {
      method: 'POST',
      headers: {
        authorization: `Token ${apiKey}`,
        'content-type': mime,
      },
      body: file.buffer as unknown as BodyInit,
    });

    if (!response.ok) {
      const body = await response.text();
      this.debug(`Deepgram error status: ${response.status}`);
      this.debug(`Deepgram error body length: ${body.length}`);
      throw new ServiceUnavailableException('Deepgram transcription failed');
    }

    const json = (await response.json()) as DeepgramResponse;
    const normalized = this.normalizeDeepgram(json, deepgramLanguage ?? null);
    const finalLanguage =
      deepgramLanguage === undefined && normalized.confidence < 0.55
        ? 'unknown'
        : normalized.language;
    const result = { ...normalized, language: finalLanguage };
    this.debug(`Deepgram detected language: ${normalized.language}`);
    this.debug(`confidence: ${normalized.confidence}`);
    this.debug(`transcript length: ${normalized.transcript.length}`);
    this.debug(
      `returned response body shape: ${JSON.stringify({
        transcript: 'string',
        language: 'string',
        confidence: 'number',
        duration: 'number',
      })}`,
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
    if (language in languageMap) return languageMap[language];
    throw new BadRequestException('Langue de transcription non supportée.');
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

  private debug(message: string) {
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      this.logger.debug(message);
    }
  }
}
