import { emailIntentAnalysisSchema } from './schemas/ai.schemas';
import { recipientStyleRules } from './config/recipient-style-rules';
import { analysisFixture } from './testing/ai-test.fixtures';
import { emailGenerationPrompt } from './prompts/registry';

describe('production email scenarios', () => {
  it.each([
    ['demande de congé à un manager', 'leave_request', 'manager', 'formal', 'respectful'],
    ['annulation de rendez-vous', 'cancellation', 'unknown', 'professional', 'apologetic'],
    ['demande de devis fournisseur', 'quotation', 'supplier', 'business', 'professional'],
    ['message amical à un collègue', 'information', 'colleague', 'semi_formal', 'friendly'],
    ['réclamation client', 'complaint', 'client', 'professional', 'empathetic'],
    ['email technique', 'technical', 'colleague', 'professional', 'professional'],
  ] as const)(
    'validates metadata for %s',
    (_case, emailIntent, detectedRecipientType, detectedRelationship, detectedTone) => {
      const parsed = emailIntentAnalysisSchema.parse({
        ...analysisFixture,
        emailIntent,
        detectedRecipientType,
        detectedRelationship,
        detectedTone,
      });
      expect(parsed).toMatchObject({
        emailIntent,
        detectedRecipientType,
        detectedRelationship,
        detectedTone,
      });
    },
  );

  it.each([
    ['très courte', 'Merci', 'short', []],
    ['ambiguë', 'Parler de ce sujet bientôt.', 'short', ['Le sujet et le moment sont imprécis.']],
  ])(
    'keeps a %s transcript structured without inventing facts',
    (_case, correctedTranscript, emailComplexity, ambiguities) => {
      const parsed = emailIntentAnalysisSchema.parse({
        ...analysisFixture,
        correctedTranscript,
        emailComplexity,
        ambiguities,
        keyFacts: [correctedTranscript],
      });
      expect(parsed.correctedTranscript).toBe(correctedTranscript);
      expect(parsed.ambiguities).toEqual(ambiguities);
    },
  );

  it('centralizes recipient tone rules and forbids informal address without context', () => {
    expect(recipientStyleRules.manager.preferredTones).toContain('respectful');
    expect(recipientStyleRules.colleague.preferredTones).toContain('friendly');
    expect(emailGenerationPrompt.template).toContain('never use informal second-person forms');
  });
});
