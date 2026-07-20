import { generatedEmailContentSchema, generatedEmailSchema } from './ai.schemas';

const content = {
  subject: 'Absence prévue demain',
  body: 'Bonjour,\n\nJe serai absent demain.\n\nCordialement,',
  detectedLanguage: 'fr',
  detectedTone: 'professional',
  emailType: 'information',
  confidence: 0.95,
};

describe('AI email schemas', () => {
  it('accepts the unique LLM output schema', () => {
    expect(generatedEmailContentSchema.parse(content)).toEqual(content);
  });

  it('requires backend metadata only on the final schema', () => {
    expect(
      generatedEmailSchema.parse({ ...content, provider: 'groq', model: 'test', repaired: false }),
    ).toMatchObject({ provider: 'groq', repaired: false });
    expect(generatedEmailContentSchema.safeParse({ ...content, provider: 'groq' }).success).toBe(
      false,
    );
  });
});
