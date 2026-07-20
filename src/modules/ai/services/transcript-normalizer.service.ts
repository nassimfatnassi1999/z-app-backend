import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiPipelineException } from '../ai-pipeline.error';

@Injectable()
export class TranscriptNormalizerService {
  private readonly maxLength: number;

  constructor(config: ConfigService) {
    const configured = Number(config.get<string>('AI_MAX_TRANSCRIPT_CHARS') ?? 20_000);
    this.maxLength = Number.isInteger(configured) && configured > 0 ? configured : 20_000;
  }

  normalize(input: string, requestId = 'unknown'): string {
    const raw = String(input ?? '')
      .normalize('NFKC')
      .trim();
    if (!raw) {
      throw new AiPipelineException(
        'EMPTY_TRANSCRIPT',
        false,
        requestId,
        'Transcript is empty',
        400,
      );
    }
    if (raw.length > this.maxLength) {
      throw new AiPipelineException(
        'TRANSCRIPT_TOO_LONG',
        false,
        requestId,
        `Transcript exceeds ${this.maxLength} characters`,
        413,
      );
    }
    const normalized = raw
      .replace(/\[(?:noise|music|silence|inaudible|bruit|musique)\]/gi, ' ')
      .replace(/\((?:noise|music|silence|inaudible|bruit|musique)\)/gi, ' ')
      .replace(/\b(?:e+u+h+|euh+|heu+|hum+|hmm+|um+|uh+|erm+)\b[,.…]?/gi, ' ')
      .replace(/\b(?:donc\s+voilà|enfin|voilà|you know|like)(?=\s|[,….]|$)[,.…]?/gi, ' ')
      .replace(/\b([\p{L}\p{N}'’-]+)(?:\s+\1\b)+/giu, '$1')
      .replace(/\b((?:[\p{L}\p{N}'’-]+\s+){1,4}[\p{L}\p{N}'’-]+)(?:[\s,;:–—-]+\1\b)+/giu, '$1')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([,;:!?])(?=\S)/g, '$1 ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!normalized) {
      throw new AiPipelineException(
        'EMPTY_TRANSCRIPT',
        false,
        requestId,
        'Transcript contains no meaningful content',
        400,
      );
    }
    return normalized;
  }

  detectLanguage(transcript: string, selected?: string): string {
    const explicit = selected?.trim().toLowerCase();
    if (explicit && !['auto', 'unknown'].includes(explicit)) return explicit.split('-')[0];
    const normalized = transcript.toLocaleLowerCase();
    if (/\b(?:in english|write (?:it|this) in english|en anglais)\b/i.test(normalized)) return 'en';
    if (/\b(?:en français|in french|écris .+ français)\b/i.test(normalized)) return 'fr';
    const french = (
      normalized.match(
        /\b(?:je|vous|nous|le|la|les|un|une|pour|avec|demande|merci|bonjour|rendez-vous)\b/g,
      ) ?? []
    ).length;
    const english = (
      normalized.match(/\b(?:i|you|we|the|a|an|for|with|ask|tell|thank|hello|before)\b/g) ?? []
    ).length;
    return english > french ? 'en' : 'fr';
  }
}
