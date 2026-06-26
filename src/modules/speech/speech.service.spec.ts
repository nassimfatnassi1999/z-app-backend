import { ServiceUnavailableException } from '@nestjs/common';
import { SpeechService } from './speech.service';

const config = {
  get: (key: string) => {
    if (key === 'DEEPGRAM_API_KEY') return 'test-key';
    if (key === 'DEEPGRAM_MODEL') return undefined;
    if (key === 'NODE_ENV') return 'test';
    return undefined;
  },
};

const file = {
  mimetype: 'audio/m4a',
  originalname: 'voice.m4a',
  size: 10,
  buffer: Buffer.from('audio'),
};

describe('SpeechService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('retries with auto-detect when selected language fails', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'bad language',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: {
            channels: [
              {
                alternatives: [
                  {
                    transcript: 'Hello, write an email in German.',
                    confidence: 0.9,
                    detected_language: 'en',
                  },
                ],
              },
            ],
          },
          metadata: { duration: 1.2 },
        }),
      });
    global.fetch = fetchMock as any;

    const result = await new SpeechService(config as any).transcribe(file, 'fr');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain('detect_language=true');
    expect(result.transcript).toBe('Hello, write an email in German.');
    expect(result.detectedLanguage).toBe('en');
  });

  it('returns transcript when auto-detect language is unknown', async () => {
    global.fetch = jest.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: {
          channels: [
            {
              alternatives: [
                {
                  transcript: 'Valid transcript without a known language.',
                  confidence: 0.2,
                  detected_language: 'unknown',
                },
              ],
            },
          ],
        },
        metadata: { duration: 0.9 },
      }),
    }) as any;

    const result = await new SpeechService(config as any).transcribe(file, 'auto');

    expect(result.transcript).toBe('Valid transcript without a known language.');
    expect(result.detectedLanguage).toBe('unknown');
    expect(result.confidence).toBe(0.2);
  });

  it('throws when selected language and auto fallback both fail', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'unavailable',
    }) as any;

    await expect(new SpeechService(config as any).transcribe(file, 'es')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
