import { Injectable } from '@nestjs/common';
import { validationPromptV1 } from '../prompts/registry';
import {
  EmailValidation,
  emailValidationSchema,
  GeneratedEmail,
  TranscriptExtraction,
} from '../schemas/ai.schemas';
import { GroqJsonProvider } from '../providers/groq-json.provider';

@Injectable()
export class EmailValidationService {
  private readonly neutralScaffolding = new Set(
    [
      'bonjour',
      'bonsoir',
      'cordialement',
      'bien cordialement',
      'hello',
      'dear',
      'sincerely',
      'regards',
      'best regards',
      'kind regards',
      'guten tag',
      'mit freundlichen grüßen',
      'hola',
      'atentamente',
      'saludos cordiales',
      'buongiorno',
      'cordiali saluti',
      'olá',
      'cumprimentos',
      'geachte',
      'met vriendelijke groet',
      'merhaba',
      'saygılarımla',
    ].map((value) => this.normalize(value)),
  );

  constructor(private readonly groq: GroqJsonProvider) {}
  async validate(
    transcript: string,
    extraction: TranscriptExtraction,
    email: GeneratedEmail,
  ): Promise<EmailValidation> {
    const result = await this.groq.complete({
      kind: 'validation',
      prompt: validationPromptV1,
      input: { transcript, extraction, email },
      schema: emailValidationSchema,
      temperature: 0,
    });
    const value = result.value;
    const normalizedTranscript = this.normalize(transcript);
    const normalizedEmail = this.normalize([email.subject, email.body, email.recipient].join('\n'));
    const correctedTerms = extraction.transcriptionCorrections.map(({ corrected }) =>
      this.normalize(corrected),
    );
    const unsupportedClaims = value.unsupportedClaims.filter((claim) => {
      const normalizedClaim = this.normalizeClaim(claim);
      return (
        !normalizedTranscript.includes(normalizedClaim) &&
        !correctedTerms.some(
          (term) => term.includes(normalizedClaim) || normalizedClaim.includes(term),
        ) &&
        !this.neutralScaffolding.has(normalizedClaim)
      );
    });
    const missingFacts = value.missingFacts.filter((fact) => {
      const normalizedFact = this.normalizeClaim(fact);
      if (normalizedEmail.includes(normalizedFact)) return false;
      const correction = extraction.transcriptionCorrections.find(
        ({ source }) => this.normalize(source) === normalizedFact,
      );
      return !correction || !normalizedEmail.includes(this.normalize(correction.corrected));
    });
    const pass =
      value.supportedFacts &&
      value.negationPreserved &&
      value.languageMatch &&
      value.toneMatch &&
      value.actionClear &&
      missingFacts.length === 0 &&
      unsupportedClaims.length === 0;
    return {
      ...value,
      missingFacts,
      unsupportedClaims,
      pass,
    };
  }

  private normalizeClaim(value: string) {
    return this.normalize(value).replace(/^["'«»\s]+|["'«».,;:!?\s]+$/g, '');
  }

  private normalize(value: string) {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[’]/g, "'")
      .toLocaleLowerCase('fr')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
