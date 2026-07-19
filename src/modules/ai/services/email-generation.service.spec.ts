import { generatedEmailSchema } from '../schemas/ai.schemas';
import { analysisFixture, emailFixture } from '../testing/ai-test.fixtures';
import { EmailGenerationService } from './email-generation.service';

describe('EmailGenerationService', () => {
  it('generates only from analysis and forces canonical metadata', async () => {
    const complete = jest.fn().mockResolvedValue({
      model: 'test-model',
      value: { ...emailFixture, detectedLanguage: 'en', recipient: 'Other' },
    });
    const service = new EmailGenerationService({ complete } as never);
    const result = await service.generate({
      transcript: 'raw transcript',
      extraction: analysisFixture,
    });
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'generation',
        schema: generatedEmailSchema,
        temperature: 0.35,
        topP: 0.7,
        input: expect.objectContaining({
          correctedTranscript: analysisFixture.correctedTranscript,
        }),
      }),
    );
    expect(result.value).toMatchObject({
      detectedLanguage: 'fr',
      detectedRecipientType: 'colleague',
      recipient: 'Ahmed',
    });
  });
});
