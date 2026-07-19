import { EmailGenerationService } from './email-generation.service';

const extraction = {
  language: 'fr',
  intent: 'Informer',
  recipient: 'Achref',
  facts: ['Des bugs subsistent dans la génération des emails'],
  constraints: [],
  requestedActions: [],
  dates: ['demain matin'],
  amounts: [],
  names: ['Achref'],
  keywords: ['application', 'bugs', 'génération des emails'],
  transcriptionCorrections: [],
  tone: 'professional',
  ambiguities: [],
  needsClarification: false,
  clarificationQuestions: [],
};

describe('EmailGenerationService', () => {
  it('delegates to the provider router and preserves canonical extraction fields', async () => {
    const generateEmail = jest.fn().mockResolvedValue({
      subject: "Avancement des modifications de l'application",
      body: 'Bonjour Achref,\n\nDes bugs subsistent dans la génération des emails. Je pense terminer demain matin.\n\nCordialement,',
      detectedLanguage: 'en',
      detectedRecipientType: 'person',
      detectedRelationship: 'professional',
      detectedTone: 'professional',
      emailIntent: 'inform',
      emailComplexity: 'simple',
      confidence: 0.91,
      validationWarnings: [],
    });
    const service = new EmailGenerationService({ generateEmail } as never);

    const result = await service.generate({
      transcript:
        "Bonjour Achref, j'ai modifié l'application, mais des bugs subsistent dans la génération des emails. Je pense terminer demain matin.",
      extraction,
    });

    expect(generateEmail).toHaveBeenCalledWith(expect.objectContaining({ extraction }));
    expect(result.value).toMatchObject({
      language: 'fr',
      recipient: 'Achref',
      confidence: 0.91,
    });
  });
});
