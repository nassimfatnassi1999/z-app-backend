import { emailIntentAnalysisSchema, generatedEmailSchema } from './ai.schemas';
import { analysisFixture, emailFixture } from '../testing/ai-test.fixtures';

describe('strict AI schemas', () => {
  it('accepts the complete structured analysis', () => {
    expect(emailIntentAnalysisSchema.parse(analysisFixture)).toEqual(analysisFixture);
  });

  it('rejects unknown or partial analysis properties', () => {
    expect(() => emailIntentAnalysisSchema.parse({ ...analysisFixture, invented: true })).toThrow();
    expect(() => emailIntentAnalysisSchema.parse({ detectedLanguage: 'fr' })).toThrow();
  });

  it('normalizes nullable extraction lists to empty arrays', () => {
    expect(emailIntentAnalysisSchema.parse({ ...analysisFixture, amounts: null }).amounts).toEqual(
      [],
    );
  });

  it('accepts the public metadata-rich email contract and rejects partial JSON', () => {
    expect(generatedEmailSchema.parse(emailFixture)).toEqual(emailFixture);
    expect(() =>
      generatedEmailSchema.parse({ subject: 'Objet', body: 'Corps incomplet.' }),
    ).toThrow();
  });
});
