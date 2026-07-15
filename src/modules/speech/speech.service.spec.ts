import { ConfigService } from '@nestjs/config';
import { SpeechService } from './speech.service';

describe('SpeechService', () => {
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        DEEPGRAM_API_KEY: 'test-key',
        DEEPGRAM_MODEL: 'nova-3-general',
        NODE_ENV: 'test',
      };
      return values[key];
    }),
  } as unknown as ConfigService;
  const wav = Buffer.from('RIFF0000WAVEdata', 'ascii');
  const file = {
    buffer: wav,
    size: wav.length,
    mimetype: 'audio/wav',
    originalname: 'voice.wav',
  };

  afterEach(() => jest.restoreAllMocks());

  it('rejects an empty audio file with a structured code', async () => {
    const service = new SpeechService(config);
    await expect(
      service.transcribe({ ...file, buffer: Buffer.alloc(0), size: 0 }),
    ).rejects.toMatchObject({
      response: { error: { code: 'AUDIO_EMPTY' } },
    });
  });

  it('rejects silence before returning a transcript', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            results: { channels: [{ alternatives: [{ transcript: ' ', confidence: 0 }] }] },
            metadata: { duration: 3.2 },
          }),
          { status: 200 },
        ),
    );
    const service = new SpeechService(config);

    await expect(service.transcribe(file)).rejects.toMatchObject({
      response: { error: { code: 'NO_SPEECH' } },
    });
  });

  it('rejects low-confidence speech with a quality error', async () => {
    jest.spyOn(global, 'fetch').mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            results: {
              channels: [
                {
                  alternatives: [
                    {
                      transcript: 'Bonjour, ceci est un test.',
                      confidence: 0.2,
                      languages: ['fr'],
                    },
                  ],
                },
              ],
            },
            metadata: { duration: 4.1 },
          }),
          { status: 200 },
        ),
    );
    const service = new SpeechService(config);

    await expect(service.transcribe(file)).rejects.toMatchObject({
      response: { error: { code: 'LOW_CONFIDENCE' } },
    });
  });

  it('uses Nova-3 auto detection without an incompatible language parameter', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            channels: [
              {
                detected_language: 'fr',
                alternatives: [{ transcript: 'Bonjour, ceci est un test.', confidence: 0.91 }],
              },
            ],
          },
          metadata: { duration: 3.4 },
        }),
        { status: 200 },
      ),
    );

    await new SpeechService(config).transcribe(file, 'auto');
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('model=nova-3-general');
    expect(url).toContain('detect_language=true');
    expect(url).not.toMatch(/[?&]language=/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['fr', 'en', 'de', 'es', 'it', 'pt', 'nl'])(
    'sends manual language %s without automatic detection',
    async (language) => {
      const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            results: {
              channels: [
                {
                  detected_language: 'en',
                  alternatives: [
                    { transcript: 'Message professionnel complet.', confidence: 0.94 },
                  ],
                },
              ],
            },
            metadata: { duration: 3.4 },
          }),
          { status: 200 },
        ),
      );

      const result = await new SpeechService(config).transcribe(file, language);
      const url = String(fetchMock.mock.calls[0][0]);
      expect(url).toContain(`language=${language}`);
      expect(url).not.toContain('detect_language');
      expect(result.language).toBe(language);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it('rejects an invalid language before contacting Deepgram', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');

    await expect(new SpeechService(config).transcribe(file, 'xx')).rejects.toMatchObject({
      response: { error: { code: 'INVALID_LANGUAGE' } },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the same manual language on its single quality retry', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: { channels: [{ alternatives: [{ transcript: '', confidence: 0 }] }] },
            metadata: { duration: 2.4 },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: {
              channels: [
                {
                  alternatives: [
                    { transcript: 'Buongiorno, confermo la riunione.', confidence: 0.91 },
                  ],
                },
              ],
            },
            metadata: { duration: 2.4 },
          }),
          { status: 200 },
        ),
      );

    const result = await new SpeechService(config).transcribe(file, 'it');

    expect(result.language).toBe('it');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      const url = String(call[0]);
      expect(url).toContain('language=it');
      expect(url).not.toContain('detect_language');
    }
  });

  it('limits a low-quality fallback to one second attempt', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: { channels: [{ alternatives: [{ transcript: '', confidence: 0 }] }] },
            metadata: { duration: 2 },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: {
              channels: [
                {
                  alternatives: [{ transcript: 'Guten Tag, das ist ein Test.', confidence: 0.88 }],
                },
              ],
            },
            metadata: { duration: 2 },
          }),
          { status: 200 },
        ),
      );

    const result = await new SpeechService(config).transcribe(file, 'auto');
    expect(result.transcript).toContain('Guten Tag');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const fallbackUrl = String(fetchMock.mock.calls[1][0]);
    expect(fallbackUrl).toContain('model=nova-3-general');
    expect(fallbackUrl).toContain('detect_language=true');
    expect(fallbackUrl).not.toMatch(/[?&]language=/);
  });
});
