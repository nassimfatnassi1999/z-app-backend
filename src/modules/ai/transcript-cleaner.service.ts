import { Injectable } from '@nestjs/common';

@Injectable()
export class TranscriptCleanerService {
  clean(input: string): string {
    return input
      .normalize('NFKC')
      .replace(/\[(?:noise|music|silence|inaudible|bruit|musique)\]/gi, ' ')
      .replace(/\((?:noise|music|silence|inaudible|bruit|musique)\)/gi, ' ')
      .replace(/\b(?:e+u+h+|euh+|heu+|hum+|hmm+|um+|uh+|erm+)\b[,.…]?/gi, ' ')
      .replace(/\b([\p{L}\p{N}'’-]+)(?:\s+\1\b)+/giu, '$1')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([,;:!?])(?=\S)/g, '$1 ')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
