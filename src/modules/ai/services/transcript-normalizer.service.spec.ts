import { ConfigService } from '@nestjs/config';
import { TranscriptNormalizerService } from './transcript-normalizer.service';

describe('TranscriptNormalizerService', () => {
  it('removes STT noise and repetition without losing protected data', () => {
    const service = new TranscriptNormalizerService(new ConfigService());
    expect(
      service.normalize(
        'Euh donc voilà confirme confirme avec Monsieur Ben Salah le 24 juillet à 14h30 à Tunis.',
      ),
    ).toBe('confirme avec Monsieur Ben Salah le 24 juillet à 14h30 à Tunis.');
  });

  it('enforces empty and configurable size limits with business codes', () => {
    const service = new TranscriptNormalizerService(
      new ConfigService({ AI_MAX_TRANSCRIPT_CHARS: '10' }),
    );
    expect(() => service.normalize(' ')).toThrow(
      expect.objectContaining({ code: 'EMPTY_TRANSCRIPT' }),
    );
    expect(() => service.normalize('un texte beaucoup trop long')).toThrow(
      expect.objectContaining({ code: 'TRANSCRIPT_TOO_LONG' }),
    );
  });

  it('prioritizes selected language over an explicit request and dominant language', () => {
    const service = new TranscriptNormalizerService(new ConfigService());
    expect(service.detectLanguage('Write this email in English.', 'fr')).toBe('fr');
    expect(service.detectLanguage('Écris ce message en anglais.')).toBe('en');
    expect(service.detectLanguage('Tell the client to test the application before Friday.')).toBe(
      'en',
    );
  });
});
