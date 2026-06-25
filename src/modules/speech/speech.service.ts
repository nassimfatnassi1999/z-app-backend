import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type DeepgramResponse = {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        confidence?: number;
        languages?: string[];
      }>;
      detected_language?: string;
    }>;
  };
  metadata?: {
    detected_language?: string;
  };
};

type TranscriptResponse = {
  transcript: string;
  language: string;
  confidence: number;
};

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
    const deepgramLanguage = this.mapLanguage(selectedLanguage);
    this.debug(`received file mime: ${file.mimetype || 'unknown'} -> ${mime}`);
    this.debug(`received file size: ${file.size ?? file.buffer?.length ?? 0}`);
    this.debug(`selected speech language: ${selectedLanguage} -> ${deepgramLanguage ?? 'auto'}`);

    if (!this.acceptedMime.has(mime)) {
      throw new BadRequestException('Format audio non supporté.');
    }

    const apiKey = this.config.get<string>('DEEPGRAM_API_KEY');
    if (!apiKey || apiKey.startsWith('REPLACE_WITH')) {
      throw new ServiceUnavailableException('Deepgram API key missing');
    }

    this.debug('Deepgram request started');
    const params = new URLSearchParams({
      model: 'nova-2',
      smart_format: 'true',
    });
    if (deepgramLanguage) {
      params.set('language', deepgramLanguage);
    } else {
      params.set('detect_language', 'true');
    }

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
    const normalized = this.normalizeDeepgram(json, deepgramLanguage);
    this.debug(`Deepgram response transcript length: ${normalized.transcript.length}`);
    this.debug(
      `returned response body shape: ${JSON.stringify({
        transcript: 'string',
        language: 'string',
        confidence: 'number',
      })}`,
    );
    return normalized;
  }

  private normalizeDeepgram(
    json: DeepgramResponse,
    selectedLanguage: string | null,
  ): TranscriptResponse {
    const channel = json.results?.channels?.[0];
    const alternative = channel?.alternatives?.[0];
    const language =
      alternative?.languages?.[0] ??
      channel?.detected_language ??
      json.metadata?.detected_language ??
      selectedLanguage ??
      'unknown';
    return {
      transcript: alternative?.transcript?.trim() ?? '',
      language,
      confidence: alternative?.confidence ?? 0,
    };
  }

  private mapLanguage(language?: string | null): string | null {
    switch (language) {
      case 'fr':
      case 'en':
      case 'ar':
        return language;
      case 'auto':
      case 'mixed':
      case '':
      case undefined:
      case null:
        return null;
      default:
        throw new BadRequestException('Langue de transcription non supportée.');
    }
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
