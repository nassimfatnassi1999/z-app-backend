import { analysisFixture, emailFixture, passingValidation } from '../testing/ai-test.fixtures';
import { AiOrchestratorService } from './ai-orchestrator.service';
import { FactualConsistencyService } from './factual-consistency.service';

const createService = (validationValues = [passingValidation], repaired = emailFixture) => {
  const repair = { repair: jest.fn().mockResolvedValue({ value: repaired }) };
  const service = new AiOrchestratorService(
    { extract: jest.fn().mockResolvedValue({ value: analysisFixture }) } as never,
    {
      generate: jest.fn().mockResolvedValue({ model: 'test-model', value: emailFixture }),
    } as never,
    {
      validate: jest
        .fn()
        .mockImplementation(() => Promise.resolve(validationValues.shift() ?? passingValidation)),
    } as never,
    repair as never,
    new FactualConsistencyService(),
  );
  return { service, repair };
};

describe('AiOrchestratorService', () => {
  it('returns metadata and quality after analysis, generation and validation', async () => {
    const { service } = createService();
    await expect(
      service.compose({ transcript: analysisFixture.correctedTranscript }),
    ).resolves.toMatchObject({
      status: 'completed',
      email: { detectedRecipientType: 'colleague', detectedTone: 'professional' },
      metadata: { retryUsed: false, fallbackUsed: false, qualityScore: { overall: 0.95 } },
    });
  });

  it('performs exactly one targeted regeneration after a low score', async () => {
    const low = {
      ...passingValidation,
      pass: false,
      qualityScore: { ...passingValidation.qualityScore, overall: 0.7 },
      validationWarnings: ['Ton trop formel'],
    };
    const { service, repair } = createService([low, passingValidation]);
    const result = await service.compose({ transcript: analysisFixture.correctedTranscript });
    expect(repair.repair).toHaveBeenCalledTimes(1);
    expect(result.metadata.retryUsed).toBe(true);
    expect(result.metadata.fallbackUsed).toBe(false);
  });

  it('rejects rather than exposing a weak draft after the one repair is rejected', async () => {
    const low = {
      ...passingValidation,
      pass: false,
      qualityScore: { ...passingValidation.qualityScore, overall: 0.6 },
      validationWarnings: ['Qualité insuffisante'],
    };
    const { service, repair } = createService([low, low]);
    await service.compose({ transcript: analysisFixture.correctedTranscript }).catch((error) =>
      expect(error.getResponse()).toMatchObject({
        error: { code: 'AI_GENERATION_FAILED', retryable: true },
      }),
    );
    expect(repair.repair).toHaveBeenCalledTimes(1);
  });
});
