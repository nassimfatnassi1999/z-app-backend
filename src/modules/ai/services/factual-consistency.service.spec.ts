import { FactualConsistencyService } from './factual-consistency.service';

const email = (subject: string, body: string) => ({
  subject,
  body,
  language: 'fr',
  recipient: '',
  confidence: 0.98,
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

  it('rejects a recipient that was not spoken', () => {
    const result = service.audit('Le message général est prêt.', {
      ...email('Message général', 'Bonjour,\n\nLe message général est prêt.\n\nCordialement,'),
      recipient: 'Sarah',
    });
    expect(result.unsupported).toContainEqual({ kind: 'named_entity', value: 'Sarah' });
  });

  it.each([
    ['es', 'viernes'],
    ['it', 'venerdì'],
    ['pt', 'sexta-feira'],
    ['nl', 'vrijdag'],
    ['tr', 'cuma'],
  ])('rejects an unsupported weekday in %s', (language, weekday) => {
    const result = service.audit('Le message est prêt.', {
      language,
      subject: 'Message',
      recipient: '',
      body: `Le message est prêt ${weekday}.`,
      confidence: 0.98,
    });
    expect(result.unsupported).toContainEqual({ kind: 'date', value: weekday });
  });

  it('does not mistake the English modal “may” for a date', () => {
    const result = service.audit('You may review the request.', {
      language: 'en',
      subject: 'Request review',
      recipient: '',
      body: 'Hello,\n\nYou may review the request.\n\nRegards,',
      confidence: 0.98,
    });
    expect(result.unsupported).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'date' })]),
    );
  });

  it('rejects omitted names, dates, amounts and extracted keywords', () => {
    const result = service.audit(
      'Bonjour Achref, confirmez le budget Atlas de 250 euros demain matin.',
      email('Confirmation', 'Bonjour,\n\nMerci de confirmer le budget.\n\nCordialement,'),
      {
        language: 'fr',
        intent: 'request',
        recipient: 'Achref',
        facts: ['Le budget Atlas est de 250 euros'],
        constraints: [],
        requestedActions: ['Confirmer'],
        dates: ['demain matin'],
        amounts: ['250 euros'],
        names: ['Achref', 'Atlas'],
        keywords: ['budget Atlas'],
        tone: 'professional',
        ambiguities: [],
        needsClarification: false,
        clarificationQuestions: [],
      },
    );

    expect(result.pass).toBe(false);
    expect(result.missing).toEqual(
      expect.arrayContaining([
        { kind: 'named_entity', value: 'Achref' },
        { kind: 'named_entity', value: 'Atlas' },
        { kind: 'date', value: 'demain' },
        { kind: 'number', value: '250 euros' },
        { kind: 'keyword', value: 'budget Atlas' },
      ]),
    );
  });

  it('rejects omitted gratitude and uncertainty without requiring the same wording', () => {
    const extraction = {
      language: 'fr',
      intent: 'inform',
      recipient: 'Achref',
      facts: ['Je pense terminer demain matin', 'Merci'],
      constraints: [],
      requestedActions: [],
      dates: ['demain matin'],
      amounts: [],
      names: ['Achref'],
      keywords: ['application'],
      tone: 'professional',
      ambiguities: [],
      needsClarification: false,
      clarificationQuestions: [],
    };
    const transcript = "Achref, j'ai modifié l'application. Je pense terminer demain matin. Merci.";
    const omitted = service.audit(
      transcript,
      {
        ...email(
          'Modification de l’application',
          "Achref, l'application a été modifiée demain matin.",
        ),
        recipient: 'Achref',
      },
      extraction,
    );
    const preserved = service.audit(
      transcript,
      {
        ...email(
          'Modification de l’application',
          "Bonjour Achref,\n\nJ'ai modifié l'application. Je pense terminer demain matin. Je vous remercie.\n\nCordialement,",
        ),
        recipient: 'Achref',
      },
      extraction,
    );

    expect(omitted.missing).toEqual(
      expect.arrayContaining([
        { kind: 'semantic_marker', value: 'gratitude: merci' },
        { kind: 'semantic_marker', value: 'uncertainty: je pense' },
      ]),
    );
    expect(preserved.pass).toBe(true);
  });

  it.each([
    [
      'de',
      'Ahmed, das Projekt Atlas kostet 250 EUR am 15. Juli.',
      'Guten Tag Ahmed,\n\nDas Projekt Atlas kostet 250 EUR am 15. Juli.\n\nMit freundlichen Grüßen,',
    ],
    [
      'es',
      'Ahmed, el proyecto Atlas cuesta 250 EUR el 15 de julio.',
      'Hola Ahmed,\n\nEl proyecto Atlas cuesta 250 EUR el 15 de julio.\n\nAtentamente,',
    ],
    [
      'it',
      'Ahmed, il progetto Atlas costa 250 EUR il 15 luglio.',
      'Buongiorno Ahmed,\n\nIl progetto Atlas costa 250 EUR il 15 luglio.\n\nCordiali saluti,',
    ],
    [
      'pt',
      'Ahmed, o projeto Atlas custa 250 EUR em 15 de julho.',
      'Olá Ahmed,\n\nO projeto Atlas custa 250 EUR em 15 de julho.\n\nCumprimentos,',
    ],
    [
      'nl',
      'Ahmed, project Atlas kost 250 EUR op 15 juli.',
      'Geachte Ahmed,\n\nProject Atlas kost 250 EUR op 15 juli.\n\nMet vriendelijke groet,',
    ],
    [
      'tr',
      'Ahmed, Atlas projesi 15 Temmuz tarihinde 250 EUR tutuyor.',
      'Merhaba Ahmed,\n\nAtlas projesi 15 Temmuz tarihinde 250 EUR tutuyor.\n\nSaygılarımla,',
    ],
  ])(
    'allows neutral email scaffolding without flagging names in %s',
    (language, transcript, body) => {
      const result = service.audit(transcript, {
        language,
        subject: 'Atlas',
        recipient: 'Ahmed',
        body,
        confidence: 0.98,
      });
      expect(result.pass).toBe(true);
    },
  );

  it('does not mistake title-cased Turkish subject words for invented names', () => {
    const transcript =
      'Deniz, Atlas projesinin teslimatını 18 Temmuz Cuma günü saat 14:30 için onaylayın.';
    const result = service.audit(transcript, {
      language: 'tr',
      subject: 'Atlas Projesi Teslimat Onayı',
      recipient: 'Deniz',
      body: 'Merhaba Deniz,\n\nAtlas projesinin teslimatını 18 Temmuz Cuma günü saat 14:30 için onaylayın.\n\nSaygılarımla,',
      confidence: 0.98,
    });
    expect(result.pass).toBe(true);
  });
});
