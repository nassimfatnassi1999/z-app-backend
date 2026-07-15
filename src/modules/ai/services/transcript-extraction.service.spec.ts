import { TranscriptExtractionService } from './transcript-extraction.service';

const extracted = {
  language: 'en',
  intent: 'rewrite',
  recipient: null,
  facts: ['Rendez-vous le 18 juillet à 14 h 30'],
  constraints: [],
  requestedActions: [],
  dates: ['18 juillet', '14 h 30'],
  amounts: [],
  names: [],
  keywords: ['rendez-vous'],
  tone: 'professional',
  ambiguities: [],
  needsClarification: false,
  clarificationQuestions: [],
};

describe('TranscriptExtractionService', () => {
  it('keeps a supported manual language even when the model detects English', async () => {
    const complete = jest.fn().mockResolvedValue({ model: 'test-model', value: extracted });
    const service = new TranscriptExtractionService({ complete } as never);

    const result = await service.extract(
      'Rendez-vous le 18 juillet à 14 h 30.',
      'fr',
      'professional',
    );

    expect(result.value.language).toBe('fr');
    expect(result.value.facts).toEqual(extracted.facts);
  });

  it('retains provider detection in automatic mode', async () => {
    const complete = jest.fn().mockResolvedValue({ model: 'test-model', value: extracted });
    const service = new TranscriptExtractionService({ complete } as never);

    const result = await service.extract('Meeting tomorrow.', 'auto');

    expect(result.value.language).toBe('en');
  });
});
