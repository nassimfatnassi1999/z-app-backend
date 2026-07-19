import { TranscriptCleanerService } from './transcript-cleaner.service';

describe('TranscriptCleanerService', () => {
  const service = new TranscriptCleanerService();

  it.each([
    ['Ajouter une concordelle.', 'Ajouter une corbeille.'],
    ['Il faut suprimer deux emails.', 'Il faut supprimer deux emails.'],
    ['Ouvrir le drop down.', 'Ouvrir le menu déroulant.'],
    ['Améliorer le voice to text.', 'Améliorer le transcription vocale.'],
  ])('corrects only a high-confidence STT error', (source, corrected) => {
    const result = service.clean(source);
    expect(result.correctedTranscript).toBe(corrected);
    expect(result.corrections[0]).toMatchObject({ confidence: 0.97, reason: expect.any(String) });
  });

  it('preserves proper names, dates, amounts and quantities', () => {
    const source = 'M. Concordelle commande 50 Atlas X le 12 août pour 2 500 TND.';
    expect(service.clean(source).correctedTranscript).toBe(source);
  });
});
