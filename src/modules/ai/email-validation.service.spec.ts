import { EmailValidationService } from './email-validation.service';
import { EmailSourceContext, GeneratedEmailResponse } from './ai.types';

describe('EmailValidationService structured validation', () => {
  const service = new EmailValidationService();
  const source = {
    rawTranscript: 'Écrire à Marie pour demander un rendez-vous le 15 juillet pour 50 EUR.',
    normalizedTranscript: 'Écrire à Marie pour demander un rendez-vous le 15 juillet pour 50 EUR.',
    analysis: {} as EmailSourceContext['analysis'],
    languageContext: { speechLanguageMode: 'fr', effectiveOutputLanguage: 'fr', resolutionSource: 'forced' },
    requiredFacts: [
      { kind: 'name', value: 'Marie' },
      { kind: 'date', value: '15 juillet' },
      { kind: 'amount', value: '50 EUR' },
    ],
    requestedActions: ['demander un rendez-vous'],
    targetTone: 'professional',
    targetEnrichmentLevel: 'medium',
  } satisfies EmailSourceContext;
  const draft = {
    subject: 'Rendez-vous avec Marie',
    body: 'Bonjour Marie,\n\nJe souhaite demander un rendez-vous le 15 juillet concernant 50 EUR.\n\nCordialement,',
    language: 'fr', tone: 'professional', emailType: 'meeting_request',
  } as GeneratedEmailResponse;

  it('accepts a faithful reformulation', () => expect(service.validateDraft(draft, source).valid).toBe(true));
  it('blocks language mismatch', () => {
    expect(service.validateDraft({ ...draft, language: 'en' }, source).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'EMAIL_LANGUAGE_MISMATCH', severity: 'blocking' })]),
    );
  });
  it.each([
    ['EMAIL_SUBJECT_EMPTY', { subject: '' }],
    ['EMAIL_BODY_EMPTY', { body: '' }],
    ['EMAIL_FORMAT_INVALID', { body: '```json {"body":"x"}' }],
    ['EMAIL_PLACEHOLDER_UNRESOLVED', { body: 'Bonjour [Votre nom]' }],
    ['EMAIL_REQUIRED_FACT_MISSING', { body: 'Bonjour Marie, merci.', subject: 'Rendez-vous' }],
    ['EMAIL_UNSUPPORTED_FACT', { body: `${draft.body} Téléphone: +216 12 345 678.` }],
  ])('reports %s', (code, change) => {
    expect(service.validateDraft({ ...draft, ...change }, source).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ code })]),
    );
  });

  it('warns for a generic subject without requesting repair', () => {
    const result = service.validateDraft({ ...draft, subject: 'Demande' }, source);
    expect(result.valid).toBe(true);
    expect(result.requiresRepair).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'EMAIL_SUBJECT_TOO_GENERIC', severity: 'warning' }),
    ]));
  });

  it('computes a deterministic local score without an LLM call', () => {
    expect(service.score(draft, source)).toMatchObject({
      total: expect.any(Number),
      factualFaithfulness: 25,
    });
  });
});
