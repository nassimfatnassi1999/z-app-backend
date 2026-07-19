import { Injectable } from '@nestjs/common';
import { emailAnalysisPrompt } from '../prompts/registry';
import { transcriptExtractionSchema } from '../schemas/ai.schemas';
import { GroqJsonProvider } from '../providers/groq-json.provider';
import { TranscriptCleanerService } from './transcript-cleaner.service';

const MANUAL_LANGUAGES = new Set(['fr', 'en', 'de', 'es', 'it', 'pt', 'nl', 'tr']);

@Injectable()
export class TranscriptExtractionService {
  constructor(
    private readonly groq: GroqJsonProvider,
    private readonly cleaner: TranscriptCleanerService,
  ) {}

  async extract(transcript: string, detectedLanguage?: string, requestedTone?: string) {
    const cleaned = this.cleaner.clean(transcript);
    const result = await this.groq.complete({
      kind: 'extraction',
      prompt: emailAnalysisPrompt,
      input: {
        correctedTranscript: cleaned.correctedTranscript,
        deterministicCorrections: cleaned.corrections,
        detectedLanguage,
        requestedTone,
      },
      schema: transcriptExtractionSchema,
      temperature: 0,
    });
    const withDeterministicCorrections = {
      ...result,
      value: {
        ...result.value,
        transcriptCorrections: [
          ...cleaned.corrections,
          ...result.value.transcriptCorrections,
        ].slice(0, 20),
      },
    };
    const requestedLanguage = detectedLanguage?.trim().toLowerCase().split('-')[0] ?? '';
    if (!MANUAL_LANGUAGES.has(requestedLanguage)) return withDeterministicCorrections;
    return {
      ...withDeterministicCorrections,
      value: { ...withDeterministicCorrections.value, detectedLanguage: requestedLanguage },
    };
  }
}
