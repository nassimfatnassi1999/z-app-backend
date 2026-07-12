import { mapDeepgramResponse } from './deepgram.mapper';

describe('mapDeepgramResponse', () => {
  it.each([['fr', 'Bonjour'], ['en', 'Hello']])('maps auto %s without inventing language confidence', (language, transcript) => {
    const result = mapDeepgramResponse({
      metadata: { duration: 1.5 },
      results: { channels: [{ detected_language: language, alternatives: [{ transcript, confidence: 0.88 }] }] },
    }, 'nova-3');
    expect(result).toMatchObject({ transcript, language, transcriptionConfidence: 0.88, durationMs: 1500 });
    expect(result.languageDetectionConfidence).toBeUndefined();
  });

  it('returns unknown for incomplete payload and preserves empty transcript', () => {
    expect(mapDeepgramResponse({}, 'nova-3')).toMatchObject({ transcript: '', language: 'unknown' });
  });
});
