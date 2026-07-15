import { FactualConsistencyService } from './factual-consistency.service';

const email = (subject: string, body: string) => ({
  subject,
  body,
  language: 'fr',
  tone: 'professional',
  intent: 'Informer',
  recipientSuggestion: null,
});

describe('FactualConsistencyService', () => {
  const service = new FactualConsistencyService();

  it('accepts names, dates and numbers present in the transcript', () => {
    const result = service.audit(
      'Bonjour Ahmed, rendez-vous mardi 15 juillet à 12 heures pour 250 euros.',
      email(
        'Rendez-vous mardi',
        'Bonjour Ahmed,\n\nLe rendez-vous est mardi 15 juillet à 12 heures pour 250 euros.\n\nCordialement,',
      ),
    );
    expect(result.pass).toBe(true);
  });

  it.each([
    ['a new name', 'Projet Atlas', 'Le projet Atlas est confirmé.', 'named_entity'],
    ['a new date', 'Disponibilité', 'La réunion est vendredi.', 'date'],
    ['a new amount', 'Budget', 'Le budget est de 900 euros.', 'number'],
    ['a new email address', 'Contact', 'Écrivez à client@example.com.', 'contact'],
  ])('rejects %s', (_label, subject, body, kind) => {
    const result = service.audit('Le message est confirmé.', email(subject, body));
    expect(result.pass).toBe(false);
    expect(result.unsupported).toEqual(expect.arrayContaining([expect.objectContaining({ kind })]));
  });
});
