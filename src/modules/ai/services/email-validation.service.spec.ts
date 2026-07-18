import { EmailValidationService } from './email-validation.service';

const extraction = {
  language: 'fr',
  intent: 'rewrite',
  recipient: 'Achref',
  facts: ['Merci'],
  constraints: [],
  requestedActions: [],
  dates: [],
  amounts: [],
  names: ['Achref'],
  keywords: ['application'],
  transcriptionCorrections: [],
  tone: 'professional',
  ambiguities: [],
  needsClarification: false,
  clarificationQuestions: [],
};

const email = {
  language: 'fr',
  subject: "Mise à jour de l'application",
  recipient: 'Achref',
  body: "Bonjour Achref,\n\nJ'ai modifié l'application. Merci.\n\nCordialement",
  confidence: 0.98,
};

const validation = (unsupportedClaims: string[]) => ({
  supportedFacts: true,
  missingFacts: [],
  unsupportedClaims,
  negationPreserved: true,
  languageMatch: true,
  toneMatch: true,
  actionClear: true,
  pass: unsupportedClaims.length === 0,
});

describe('EmailValidationService', () => {
  it('removes false positives that are literal source content or neutral scaffolding', async () => {
    const complete = jest.fn().mockResolvedValue({
      model: 'test-model',
      value: validation(['Merci', 'Cordialement']),
    });
    const service = new EmailValidationService({ complete } as never);

    await expect(
      service.validate("Achref, j'ai modifié l'application. Merci.", extraction, email),
    ).resolves.toMatchObject({ unsupportedClaims: [], pass: true });
  });

  it('keeps genuinely unsupported claims rejected', async () => {
    const complete = jest.fn().mockResolvedValue({
      model: 'test-model',
      value: validation(['Le rendez-vous de vendredi est confirmé']),
    });
    const service = new EmailValidationService({ complete } as never);

    await expect(
      service.validate("Achref, j'ai modifié l'application. Merci.", extraction, email),
    ).resolves.toMatchObject({
      unsupportedClaims: ['Le rendez-vous de vendredi est confirmé'],
      pass: false,
    });
  });

  it('accepts a declared contextual STT correction as source-supported', async () => {
    const complete = jest.fn().mockResolvedValue({
      model: 'test-model',
      value: {
        ...validation(['corbeille']),
        missingFacts: ['concordelle'],
      },
    });
    const service = new EmailValidationService({ complete } as never);
    const correctedExtraction = {
      ...extraction,
      facts: ['Ajout d’une corbeille lors de la sélection de plusieurs emails'],
      keywords: ['corbeille', 'sélection de plusieurs emails'],
      transcriptionCorrections: [{ source: 'concordelle', corrected: 'corbeille' }],
    };
    const correctedEmail = {
      ...email,
      subject: "Mise à jour de l'application",
      body: "Bonjour,\n\nJ'ai ajouté une corbeille lors de la sélection de plusieurs emails.\n\nCordialement",
    };

    await expect(
      service.validate(
        "J'ai ajouté une concordelle lors de la sélection de plusieurs emails.",
        correctedExtraction,
        correctedEmail,
      ),
    ).resolves.toMatchObject({ missingFacts: [], unsupportedClaims: [], pass: true });
  });
});
