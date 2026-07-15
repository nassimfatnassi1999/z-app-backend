import {
  generatedEmailContentSchema,
  generatedEmailSchema,
  transcriptExtractionSchema,
} from './ai.schemas';

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
  it('rejects incomplete generated emails', () =>
    expect(() => generatedEmailSchema.parse({ subject: 'Objet' })).toThrow());
  it('accepts only subject and body from the generation model', () => {
    expect(
      generatedEmailContentSchema.parse({ subject: 'Objet', body: 'Corps professionnel.' }),
    ).toEqual({ subject: 'Objet', body: 'Corps professionnel.' });
    expect(() =>
      generatedEmailContentSchema.parse({
        subject: 'Objet',
        body: 'Corps professionnel.',
        language: 'fr',
      }),
    ).toThrow();
  });
});
