import { analysisFixture } from '../testing/ai-test.fixtures';
import { TranscriptCleanerService } from './transcript-cleaner.service';
import { TranscriptExtractionService } from './transcript-extraction.service';

describe('TranscriptExtractionService', () => {
  it('keeps a supported manually requested output language', async () => {
    const complete = jest.fn().mockResolvedValue({
      model: 'test-model',
      value: { ...analysisFixture, detectedLanguage: 'en' },
    });
    const service = new TranscriptExtractionService(
      { complete } as never,
      new TranscriptCleanerService(),
    );
    const result = await service.extract('Rendez-vous le 18 juillet.', 'fr');
    expect(result.value.detectedLanguage).toBe('fr');
  });

  it('retains automatic detection and merges conservative STT corrections', async () => {
    const complete = jest.fn().mockResolvedValue({
      model: 'test-model',
      value: {
        ...analysisFixture,
        correctedTranscript: 'Ajouter une corbeille.',
        transcriptCorrections: [],
      },
    });
    const service = new TranscriptExtractionService(
      { complete } as never,
      new TranscriptCleanerService(),
    );
    const result = await service.extract('Ajouter une concordelle.', 'auto');
    expect(result.value.detectedLanguage).toBe('fr');
    expect(result.value.transcriptCorrections).toEqual([
      expect.objectContaining({
        original: 'concordelle',
        corrected: 'corbeille',
        confidence: 0.97,
      }),
    ]);
  });
});
