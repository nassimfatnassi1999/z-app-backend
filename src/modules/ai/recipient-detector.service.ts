import { Injectable } from '@nestjs/common';

@Injectable()
export class RecipientDetectorService {
  detect(transcript: string) {
    const recipients = [
      ...this.detectAfterPrepositions(transcript),
      ...this.detectEmails(transcript),
    ];
    return [...new Set(recipients)].filter(Boolean);
  }

  private detectAfterPrepositions(transcript: string) {
    const matches = transcript.matchAll(
      /(?:^|\s)(?:to|à|a|pour|for|إلى)\s+([A-ZÀ-Ý][\p{L}\p{N}.&'\- ]{1,50})/gu,
    );
    return [...matches].map((match) => this.cleanRecipient(match[1]));
  }

  private detectEmails(transcript: string) {
    return transcript.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  }

  private cleanRecipient(value: string) {
    return value
      .replace(/\b(?:tomorrow|demain|next|pour|for|to|in|en)\b.*$/i, '')
      .trim()
      .replace(/[.,;:]+$/, '');
  }
}
