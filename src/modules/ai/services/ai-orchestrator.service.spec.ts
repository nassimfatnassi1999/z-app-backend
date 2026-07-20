import { ConfigService } from '@nestjs/config';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { TranscriptNormalizerService } from './transcript-normalizer.service';

const content = {
  subject: 'Absence prévue demain',
  body: 'Bonjour,\n\nJe serai absent demain pour un rendez-vous médical et terminerai le rapport ce soir.\n\nCordialement,',
  detectedLanguage: 'fr',
  detectedTone: 'professional',
  emailType: 'information',
  confidence: 0.95,
  provider: 'groq',
  model: 'test-model',
  repaired: false,
};
const pass = { valid: true, errors: [], warnings: [], criticalFacts: ['demain'] };

describe('AiOrchestratorService', () => {
  const normalizer = new TranscriptNormalizerService(new ConfigService());

  it('uses one LLM generation and keeps the mobile response contract', async () => {
    const generation = {
      generate: jest.fn().mockResolvedValue({
        email: content,
        attempts: 1,
        fallbackReasons: [],
      }),
    };
    const repair = { repair: jest.fn() };
    const service = new AiOrchestratorService(
      normalizer,
      generation as never,
      { validate: jest.fn().mockReturnValue(pass) } as never,
      repair as never,
    );

    const result = await service.compose({
      transcript:
        'Euh bonjour je serai absent demain pour un rendez-vous médical et terminerai le rapport ce soir.',
      language: 'fr',
    });
    expect(generation.generate).toHaveBeenCalledTimes(1);
    expect(generation.generate.mock.calls[0][0]).not.toContain('Euh');
    expect(repair.repair).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'completed',
      email: {
        subject: content.subject,
        language: 'fr',
        tone: 'professional',
        intent: 'information',
        provider: 'groq',
        repaired: false,
      },
      metadata: { attempts: 1, retryUsed: false },
    });
  });

  it('performs exactly one repair after deterministic validation fails', async () => {
    const generation = {
      generate: jest.fn().mockResolvedValue({
        email: { ...content, body: 'transcript brut' },
        attempts: 1,
        fallbackReasons: [],
      }),
    };
    const repair = {
      repair: jest.fn().mockResolvedValue({
        email: { ...content, provider: 'gemini', repaired: true },
        attempts: 1,
        fallbackReasons: ['groq:invalid_output'],
      }),
    };
    const validate = jest
      .fn()
      .mockReturnValueOnce({ ...pass, valid: false, errors: ['MISSING_GREETING'] })
      .mockReturnValueOnce(pass);
    const service = new AiOrchestratorService(
      normalizer,
      generation as never,
      { validate } as never,
      repair as never,
    );

    const result = await service.compose({ transcript: 'Je serai absent demain.' });
    expect(repair.repair).toHaveBeenCalledTimes(1);
    expect(validate).toHaveBeenCalledTimes(2);
    expect(result.metadata).toMatchObject({ attempts: 2, retryUsed: true, fallbackUsed: true });
    expect(result.email).toMatchObject({ provider: 'gemini', repaired: true });
  });

  it('fails cleanly when the single repair is still invalid', async () => {
    const service = new AiOrchestratorService(
      normalizer,
      {
        generate: jest.fn().mockResolvedValue({ email: content, attempts: 1, fallbackReasons: [] }),
      } as never,
      {
        validate: jest.fn().mockReturnValue({
          valid: false,
          errors: ['MISSING_CRITICAL_FACT:demain'],
          warnings: [],
          criticalFacts: ['demain'],
        }),
      } as never,
      {
        repair: jest.fn().mockResolvedValue({
          email: { ...content, repaired: true },
          attempts: 1,
          fallbackReasons: [],
        }),
      } as never,
    );
    await expect(service.compose({ transcript: 'Je serai absent demain.' })).rejects.toMatchObject({
      code: 'EMAIL_VALIDATION_FAILED',
    });
  });
});
