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
});
