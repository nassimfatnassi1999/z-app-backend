import { analysisFixture, emailFixture, passingValidation } from '../testing/ai-test.fixtures';
import { EmailValidationService } from './email-validation.service';

describe('EmailValidationService', () => {
  it('removes false positives for literal source content and neutral scaffolding', async () => {
    const complete = jest.fn().mockResolvedValue({
      model: 'test-model',
      value: { ...passingValidation, unsupportedClaims: ['Cordialement'] },
    });
    const service = new EmailValidationService({ complete } as never);
    await expect(
      service.validate(analysisFixture.correctedTranscript, analysisFixture, emailFixture),
    ).resolves.toMatchObject({ unsupportedClaims: [], pass: true });
  });

  it('rejects unsupported claims and a quality score below 0.82', async () => {
    const complete = jest.fn().mockResolvedValue({
      model: 'test-model',
      value: {
        ...passingValidation,
        unsupportedClaims: ['Le rendez-vous de vendredi est confirmé'],
        qualityScore: { ...passingValidation.qualityScore, overall: 0.7 },
      },
    });
    const service = new EmailValidationService({ complete } as never);
    await expect(
      service.validate(analysisFixture.correctedTranscript, analysisFixture, emailFixture),
    ).resolves.toMatchObject({ pass: false, validationWarnings: expect.any(Array) });
  });

  it('accepts a declared contextual STT correction as supported', async () => {
    const complete = jest.fn().mockResolvedValue({
      model: 'test-model',
      value: {
        ...passingValidation,
        unsupportedClaims: ['corbeille'],
        missingFacts: ['concordelle'],
      },
    });
    const service = new EmailValidationService({ complete } as never);
    const extraction = {
      ...analysisFixture,
      correctedTranscript: 'Ajouter une corbeille.',
      transcriptCorrections: [
        {
          original: 'concordelle',
          corrected: 'corbeille',
          confidence: 0.97,
          reason: 'Contexte non ambigu.',
        },
      ],
    };
    const email = {
      ...emailFixture,
      body: 'Bonjour,\n\nAjouter une corbeille.\n\nBien cordialement,',
    };
    await expect(
      service.validate('Ajouter une concordelle.', extraction, email),
    ).resolves.toMatchObject({ missingFacts: [], unsupportedClaims: [], pass: true });
  });
});
