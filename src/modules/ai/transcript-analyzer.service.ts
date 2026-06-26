import { Injectable } from '@nestjs/common';
import { TranscriptAnalysis } from './ai.types';

@Injectable()
export class TranscriptAnalyzerService {
  analyze(transcript: string): TranscriptAnalysis {
    const cleanedTranscript = transcript.replace(/\s+/g, ' ').trim();
    const lower = cleanedTranscript.toLowerCase();
    return {
      transcript,
      cleanedTranscript,
      isMixedLanguage:
        /[a-zA-Z]/.test(cleanedTranscript) && /[\u0600-\u06ff]/.test(cleanedTranscript),
      injectionRisk: injectionSignals.some((signal) => lower.includes(signal)),
      customInstructions: this.extractCustomInstructions(cleanedTranscript),
    };
  }

  private extractCustomInstructions(transcript: string) {
    const instructions: string[] = [];
    const lower = transcript.toLowerCase();
    if (lower.includes('steve jobs'))
      instructions.push('Use concise, visionary, persuasive wording.');
    if (lower.includes('warm') || lower.includes('human'))
      instructions.push('Use a warm human tone.');
    if (lower.includes('extremely polite') || lower.includes('très poli')) {
      instructions.push('Make the wording extremely polite.');
    }
    return instructions;
  }
}

const injectionSignals = [
  'ignore previous instructions',
  'ignore all instructions',
  'system prompt',
  'developer message',
  'return markdown',
];
