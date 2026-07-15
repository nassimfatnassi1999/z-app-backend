import { ConfigService } from '@nestjs/config';
import { SpeechService } from './speech.service';

describe('SpeechService', () => {
  const config = {
    get: jest.fn((key: string) => {
      const values: Record<string, string> = {
        DEEPGRAM_API_KEY: 'test-key',
        DEEPGRAM_MODEL: 'nova-2-general',
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
      response: { error: { code: 'AUDIO_TOO_SILENT' } },
    });
  });

  it('rejects low-confidence speech with a quality error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            channels: [
              {
                alternatives: [
                  { transcript: 'Bonjour, ceci est un test.', confidence: 0.2, languages: ['fr'] },
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
      response: { error: { code: 'STT_LOW_CONFIDENCE' } },
    });
  });
});
