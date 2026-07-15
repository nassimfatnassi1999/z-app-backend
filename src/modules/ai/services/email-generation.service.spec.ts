import { generatedEmailSchema } from '../schemas/ai.schemas';
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
  tone: 'professional',
  ambiguities: [],
  needsClarification: false,
  clarificationQuestions: [],
};

describe('EmailGenerationService', () => {
  it('uses conservative sampling and canonical extraction fields', async () => {
    const complete = jest.fn().mockResolvedValue({
      model: 'test-model',
      value: {
        language: 'en',
        subject: "Avancement des modifications de l'application",
        recipient: 'Someone else',
        body: "Bonjour Achref,\n\nDes bugs subsistent dans la génération des emails. Je pense terminer demain matin.\n\nCordialement,",
        confidence: 0.91,
      },
    });
    const service = new EmailGenerationService({ complete } as never);

    const result = await service.generate({
      transcript:
        "Bonjour Achref, j'ai modifié l'application, mais des bugs subsistent dans la génération des emails. Je pense terminer demain matin.",
      extraction,
    });

    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'generation',
        schema: generatedEmailSchema,
        temperature: 0.1,
        topP: 0.2,
        presencePenalty: 0,
        frequencyPenalty: 0.1,
      }),
    );
    expect(result.value).toMatchObject({
      language: 'fr',
      recipient: 'Achref',
      confidence: 0.91,
    });
  });
});
