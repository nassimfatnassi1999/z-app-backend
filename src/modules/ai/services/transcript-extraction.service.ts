import { Injectable } from '@nestjs/common';
import { extractionPromptV1 } from '../prompts/registry';
import { transcriptExtractionSchema } from '../schemas/ai.schemas';
import { GroqJsonProvider } from '../providers/groq-json.provider';

const MANUAL_LANGUAGES = new Set(['fr', 'en', 'de', 'es', 'it', 'pt', 'nl', 'tr']);

@Injectable()
export class TranscriptExtractionService {
  constructor(private readonly groq: GroqJsonProvider) {}

  async extract(transcript: string, detectedLanguage?: string, requestedTone?: string) {
    const result = await this.groq.complete({
      kind: 'extraction',
      prompt: extractionPromptV1,
      input: { transcript: this.normalize(transcript), detectedLanguage, requestedTone },
      schema: transcriptExtractionSchema,
      temperature: 0,
    });
    const requestedLanguage = detectedLanguage?.trim().toLowerCase().split('-')[0] ?? '';
    if (!MANUAL_LANGUAGES.has(requestedLanguage)) return result;
    return {
      ...result,
      value: { ...result.value, language: requestedLanguage },
    };
  }

  private normalize(value: string) {
    return value
      .normalize('NFKC')
      .replace(/\[(?:noise|music|silence|bruit|musique)\]/gi, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }
}
