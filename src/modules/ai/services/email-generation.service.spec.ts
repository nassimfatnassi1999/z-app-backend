import { EmailGenerationService } from './email-generation.service';

describe('EmailGenerationService', () => {
  it('adds provider metadata in the backend and performs one logical generation', async () => {
    const generateEmail = jest.fn().mockResolvedValue({
      email: {
        subject: 'Absence prévue demain',
        body: 'Bonjour,\n\nJe serai absent demain.\n\nCordialement,',
        detectedLanguage: 'fr',
        detectedTone: 'professional',
        emailType: 'information',
        confidence: 0.95,
      },
      provider: 'gemini',
      model: 'gemini-test',
      attempts: 1,
      fallbackReasons: [],
    });
    const service = new EmailGenerationService({ generateEmail } as never);
    const result = await service.generate('Je serai absent demain.', { language: 'fr' }, 'req-1');

    expect(generateEmail).toHaveBeenCalledTimes(1);
    expect(generateEmail).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'generation', transcript: 'Je serai absent demain.' }),
      'req-1',
    );
    expect(result.email).toMatchObject({
      provider: 'gemini',
      model: 'gemini-test',
      repaired: false,
    });
  });
});
