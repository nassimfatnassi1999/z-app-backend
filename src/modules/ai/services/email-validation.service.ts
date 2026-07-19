import { Injectable } from '@nestjs/common';
import { emailValidationPrompt } from '../prompts/registry';
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
      prompt: emailValidationPrompt,
      input: { correctedTranscript: extraction.correctedTranscript, analysis: extraction, email },
      schema: emailValidationSchema,
      temperature: 0,
    });
    const value = result.value;
    const normalizedTranscript = this.normalize(transcript);
    const normalizedEmail = this.normalize([email.subject, email.body, email.recipient].join('\n'));
    const correctedTerms = extraction.transcriptCorrections.map(({ corrected }) =>
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
      const correction = extraction.transcriptCorrections.find(
        ({ original }) => this.normalize(original) === normalizedFact,
      );
      return !correction || !normalizedEmail.includes(this.normalize(correction.corrected));
    });
    const componentScores = [
      value.qualityScore.completeness,
      value.qualityScore.factualConsistency,
      value.qualityScore.toneFit,
      value.qualityScore.fluency,
      value.qualityScore.professionalism,
    ];
    const qualityScore = {
      ...value.qualityScore,
      overall: Number(
        (componentScores.reduce((sum, score) => sum + score, 0) / componentScores.length).toFixed(
          3,
        ),
      ),
    };
    const pass =
      value.supportedFacts &&
      value.negationPreserved &&
      value.languageMatch &&
      value.toneMatch &&
      value.actionClear &&
      value.greetingAndClosingFit &&
      value.noRepetition &&
      value.noRoboticOrMetaContent &&
      missingFacts.length === 0 &&
      unsupportedClaims.length === 0 &&
      qualityScore.overall >= 0.82;
    const validationWarnings = [
      ...value.validationWarnings,
      ...missingFacts.map((fact) => `Information manquante : ${fact}`),
      ...unsupportedClaims.map((claim) => `Information non étayée : ${claim}`),
    ];
    return {
      ...value,
      missingFacts,
      unsupportedClaims,
      qualityScore,
      validationWarnings: [...new Set(validationWarnings)],
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
