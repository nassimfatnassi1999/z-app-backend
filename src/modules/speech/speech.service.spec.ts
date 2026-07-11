import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpeechService } from './speech.service';

describe('SpeechService audio and Deepgram normalization', () => {
  const service = new SpeechService(new ConfigService({ DEEPGRAM_API_KEY: 'test' }));
  const normalize = (json: object, language: any = null) =>
    (service as any).normalizeDeepgram(json, language);
  const detect = (buffer: Buffer, mime = 'audio/mp4') => (service as any).detectMime(buffer, mime);

  it('rejects an empty audio file', () =>
    expect(() => detect(Buffer.alloc(0))).toThrow(BadRequestException));
  it('rejects content whose MIME does not match supported audio', () =>
    expect(() => detect(Buffer.from('not audio'))).toThrow(BadRequestException));
  it('recognizes an M4A/MP4 ftyp payload as audio/mp4', () => {
    const data = Buffer.alloc(16);
    data.write('ftyp', 4, 'ascii');
    expect(detect(data, 'audio/m4a')).toBe('audio/mp4');
  });
  it('keeps absent confidence as null', () =>
    expect(
      normalize({ results: { channels: [{ alternatives: [{ transcript: 'Bonjour' }] }] } })
        .confidence,
    ).toBeNull());
  it('keeps a real zero confidence as zero', () =>
    expect(
      normalize({
        results: { channels: [{ alternatives: [{ transcript: 'Bonjour', confidence: 0 }] }] },
      }).confidence,
    ).toBe(0));
  it('extracts a valid French transcript from the first alternative', () =>
    expect(
      normalize({
        results: {
          channels: [
            {
              alternatives: [
                { transcript: ' Bonjour à tous ', confidence: 0.91, detected_language: 'fr' },
              ],
            },
          ],
        },
      }),
    ).toMatchObject({ transcript: 'Bonjour à tous', confidence: 0.91, language: 'fr' }));
});
