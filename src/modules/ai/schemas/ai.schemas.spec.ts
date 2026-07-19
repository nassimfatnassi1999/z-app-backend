import { generatedEmailSchema, transcriptExtractionSchema } from './ai.schemas';

const extraction = {
  language: 'fr',
  intent: 'request',
  recipient: null,
  facts: ['Le rendez-vous est annulé'],
  constraints: [],
  requestedActions: ['Confirmer'],
  dates: [],
  amounts: [],
  names: [],
  keywords: ['rendez-vous', 'annulé', 'confirmer'],
  transcriptionCorrections: [],
  tone: 'professional',
  ambiguities: [],
  needsClarification: false,
  clarificationQuestions: [],
};

describe('strict AI schemas', () => {
  it('accepts a complete structured extraction', () =>
    expect(transcriptExtractionSchema.parse(extraction)).toEqual(extraction));
  it('rejects unknown properties', () =>
    expect(() => transcriptExtractionSchema.parse({ ...extraction, invented: true })).toThrow());
  it('requires a question when clarification is needed', () =>
    expect(() =>
      transcriptExtractionSchema.parse({ ...extraction, needsClarification: true }),
    ).toThrow());
  it('safely normalizes empty extraction values returned as null', () => {
    expect(
      transcriptExtractionSchema.parse({
        ...extraction,
        intent: null,
        constraints: null,
        amounts: null,
        ambiguities: null,
      }),
    ).toMatchObject({ intent: 'rewrite', constraints: [], amounts: [], ambiguities: [] });
  });
  it('rejects incomplete generated emails', () =>
    expect(() => generatedEmailSchema.parse({ subject: 'Objet' })).toThrow());
  it('accepts exactly the public five-field email contract', () => {
    const email = {
      language: 'fr',
      subject: 'Objet',
      recipient: '',
      body: 'Corps professionnel.',
      confidence: 0.98,
    };
    expect(generatedEmailSchema.parse(email)).toEqual(email);
    expect(() => generatedEmailSchema.parse({ ...email, tone: 'professional' })).toThrow();
  });
});
