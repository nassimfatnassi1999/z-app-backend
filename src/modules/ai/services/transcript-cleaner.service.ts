import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { transcriptCorrectionSchema } from '../schemas/ai.schemas';

export type TranscriptCorrection = z.infer<typeof transcriptCorrectionSchema>;

@Injectable()
export class TranscriptCleanerService {
  clean(input: string): { correctedTranscript: string; corrections: TranscriptCorrection[] } {
    let value = input
      .normalize('NFKC')
      .replace(/\[(?:noise|music|silence|inaudible|bruit|musique)\]/gi, ' ')
      .replace(/\((?:noise|music|silence|inaudible|bruit|musique)\)/gi, ' ')
      .replace(/\b(?:e+u+h+|euh+|heu+|hum+|hmm+|um+|uh+|erm+)\b[,.…]?/gi, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    const corrections: TranscriptCorrection[] = [];
    const safeCorrections = [
      {
        pattern: /\bconcordelle\b/giu,
        corrected: 'corbeille',
        reason: 'Homophone STT connu et non ambigu.',
      },
      {
        pattern: /\bsuprimer\b/giu,
        corrected: 'supprimer',
        reason: 'Erreur orthographique STT non ambiguë.',
      },
      {
        pattern: /\bdrop[ -]?down\b/giu,
        corrected: 'menu déroulant',
        reason: 'Terme d’interface standard.',
      },
      {
        pattern: /\bvoice[ -]?to[ -]?text\b/giu,
        corrected: 'transcription vocale',
        reason: 'Terme Speech-to-Text standard.',
      },
    ];
    for (const rule of safeCorrections) {
      value = value.replace(rule.pattern, (original, offset: number, source: string) => {
        const prefix = source.slice(Math.max(0, offset - 8), offset);
        if (/\b(?:m|mme|mr|dr)\.\s*$/iu.test(prefix)) return original;
        corrections.push({
          original,
          corrected: rule.corrected,
          confidence: 0.97,
          reason: rule.reason,
        });
        return rule.corrected;
      });
    }
    return { correctedTranscript: value, corrections };
  }
}
