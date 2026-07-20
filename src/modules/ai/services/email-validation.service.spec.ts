import { GeneratedEmailContent } from '../providers/email-ai-provider.types';
import { EmailValidationService } from './email-validation.service';

const service = new EmailValidationService();
const email = (overrides: Partial<GeneratedEmailContent>): GeneratedEmailContent => ({
  subject: 'Message professionnel',
  body: 'Bonjour,\n\nVotre message est bien pris en compte.\n\nCordialement,',
  detectedLanguage: 'fr',
  detectedTone: 'professional',
  emailType: 'information',
  confidence: 0.95,
  ...overrides,
});

describe('EmailValidationService deterministic quality checks', () => {
  it('accepts a structured professional absence email with every commitment preserved', () => {
    const transcript =
      'Bonjour je veux prévenir mon responsable que demain je pourrai pas venir parce que j’ai un rendez-vous médical et je vais terminer le rapport ce soir.';
    const result = service.validate(
      transcript,
      email({
        subject: 'Absence prévue demain',
        body: 'Bonjour,\n\nJe souhaite vous informer que je ne pourrai pas être présent demain en raison d’un rendez-vous médical.\n\nAfin de limiter l’impact de mon absence, je terminerai le rapport ce soir.\n\nJe vous remercie pour votre compréhension.\n\nCordialement,',
      }),
      'fr',
    );
    expect(result).toMatchObject({ valid: true, errors: [] });
  });

  it('preserves quantity, product, deadline and payment-condition request', () => {
    const transcript =
      'Écris au fournisseur pour demander un devis pour vingt ordinateurs Dell avec livraison avant le 15 août et demande aussi les conditions de paiement.';
    const result = service.validate(
      transcript,
      email({
        subject: 'Devis pour ordinateurs Dell',
        body: 'Bonjour,\n\nJe souhaite obtenir un devis pour 20 ordinateurs Dell, avec une livraison avant le 15 août. Merci de préciser également les conditions de paiement.\n\nCordialement,',
        emailType: 'quote_request',
      }),
      'fr',
    );
    expect(result.valid).toBe(true);
  });

  it('requires a fully English email for an English transcription', () => {
    const transcript =
      'Tell the client that the deployment is completed and ask them to test the application before Friday.';
    const result = service.validate(
      transcript,
      email({
        subject: 'Deployment completed',
        body: 'Hello,\n\nThe deployment is now complete. Please test the application before Friday.\n\nThank you.\n\nKind regards,',
        detectedLanguage: 'en',
      }),
      'en',
    );
    expect(result.valid).toBe(true);
  });

  it('rejects invented date, time or name when information is missing', () => {
    const result = service.validate(
      'Je veux demander un rendez-vous pour discuter du projet.',
      email({
        subject: 'Demande de rendez-vous',
        body: 'Bonjour Sarah,\n\nJe souhaite convenir d’un rendez-vous vendredi à 14h pour discuter du projet.\n\nCordialement,',
      }),
      'fr',
    );
    expect(result.valid).toBe(false);
    expect(result.errors.join('|')).toMatch(/UNSUPPORTED_CRITICAL_FACT:(Sarah|vendredi|14h)/i);
  });

  it('rejects remaining speech fillers', () => {
    const result = service.validate(
      'Le document est prêt et je peux l’envoyer aujourd’hui.',
      email({
        subject: 'Document prêt',
        body: 'Bonjour,\n\nEuh, le document est prêt et je peux l’envoyer aujourd’hui.\n\nCordialement,',
      }),
      'fr',
    );
    expect(result.errors).toContain('SPEECH_FILLER_REMAINS');
  });

  it('preserves Monsieur Ben Salah, 24 juillet, 14h30 and Tunis', () => {
    const transcript =
      'Confirme la réunion avec Monsieur Ben Salah le 24 juillet à 14h30 dans nos bureaux de Tunis.';
    const result = service.validate(
      transcript,
      email({
        subject: 'Confirmation de la réunion',
        body: 'Bonjour Monsieur Ben Salah,\n\nJe vous confirme la réunion du 24 juillet à 14h30 dans nos bureaux de Tunis.\n\nCordialement,',
        emailType: 'confirmation',
      }),
      'fr',
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a punctuated copy of the raw transcript', () => {
    const transcript =
      'Bonjour je veux dire que le document est prêt et je peux envoyer le document aujourd’hui merci';
    const result = service.validate(
      transcript,
      email({
        subject: 'Document prêt',
        body: 'Bonjour,\n\nJe veux dire que le document est prêt et je peux envoyer le document aujourd’hui. Merci.\n\nCordialement,',
      }),
      'fr',
    );
    expect(result.errors).toContain('TRANSCRIPT_LIKE_BODY');
  });
});
