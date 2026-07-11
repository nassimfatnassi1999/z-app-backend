import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import { EmailGenerationService } from './email-generation.service';
import { EmailValidationService } from './email-validation.service';
import { PromptBuilderService } from './prompt-builder.service';
import { TranscriptCleanerService } from './transcript-cleaner.service';
import { AIAnalysisService } from './ai-analysis.service';

const transcript =
  'Je veux envoyer un mail à mon responsable pour demander un congé vendredi prochain pour raison personnelle.';

const completeEmail = {
  language: 'fr',
  tone: 'professional',
  intent: 'leave_request',
  subject: 'Demande de congé pour vendredi prochain',
  body: 'Bonjour,\n\nJe souhaite solliciter un congé pour vendredi prochain pour une raison personnelle. Je vous remercie de bien vouloir examiner ma demande.\n\nCordialement,',
  suggestedRecipient: '',
};

function groqResponse(content: string, ok = true) {
  return {
    ok,
    json: jest.fn().mockResolvedValue({
      choices: [{ message: { content } }],
    }),
  } as unknown as Response;
}

describe('AiService email quality validation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function service(apiKey = 'test-key') {
    const config = new ConfigService({ GROQ_API_KEY: apiKey, GROQ_MODEL: 'test-model' });
    const prompts = new PromptBuilderService();
    const cleaner = new TranscriptCleanerService();
    const validation = new EmailValidationService();
    const analysis = {
      analyze: jest.fn().mockResolvedValue({
        model: 'test-model',
        fallbackUsed: false,
        analysis: {
          sourceLanguage: 'fr',
          outputLanguage: 'fr',
          outputLanguageSource: 'detected_language',
          emailType: 'leave_request',
          mainIntent: 'Demander un congé',
          recipient: {
            name: null,
            role: 'responsable',
            organization: null,
            relationship: 'manager',
          },
          sender: { name: null, role: null, organization: null },
          tone: 'professional',
          requestedLength: 'medium',
          subjectGoal: 'Demande de congé',
          facts: [],
          dates: [],
          amounts: [],
          locations: [],
          actionRequested: 'Accorder le congé',
          deadline: null,
          attachmentsMentioned: [],
          constraints: [],
          sensitiveDetails: [],
          ambiguousDetails: [],
          missingCriticalInformation: [],
          mustNotInvent: [],
          confidence: 0.9,
        },
      }),
    } as unknown as AIAnalysisService;
    const generation = new EmailGenerationService(config, cleaner, prompts, validation, analysis);
    return new AiService(config, generation);
  }

  it('returns a complete valid Groq email without retrying', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(groqResponse(JSON.stringify(completeEmail)));

    const result = await service().generateEmail({
      transcript,
      language: 'fr',
      tone: 'auto',
    });

    expect(result.subject).toBe(completeEmail.subject);
    expect(result.body).toContain('Je souhaite solliciter un congé');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses Llama only after the configured primary model fails', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(groqResponse('{}', false))
      .mockResolvedValueOnce(groqResponse(JSON.stringify(completeEmail)));

    const result = await service().generateEmail({ transcript, language: 'fr', tone: 'auto' });
    const models = fetchMock.mock.calls.map(
      (call) => JSON.parse(String((call[1] as RequestInit).body)).model,
    );
    expect(models).toEqual(['test-model', 'llama-3.3-70b-versatile']);
    expect(result.metadata).toMatchObject({
      fallbackUsed: true,
      actualGroqModelUsed: 'llama-3.3-70b-versatile',
    });
  });

  it.each([
    'professional',
    'administrative',
    'business',
    'student',
    'friendly',
    'urgent',
    'formal',
    'direct',
    'apology',
    'follow_up',
    'complaint',
    'information_request',
  ])('preserves the automatically detected %s classification', async (tone) => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(groqResponse(JSON.stringify({ ...completeEmail, tone })));

    const result = await service().generateEmail({ transcript, tone: 'auto' });

    expect(result.tone).toBe(tone);
  });

  it('requires an instruction for a custom tone', async () => {
    await expect(
      service().generateEmail({ transcript, tone: 'custom', customTone: '  ' }),
    ).rejects.toMatchObject({
      message: 'Le ton personnalisé est requis.',
    });
  });

  it('sends the selected custom instruction to Groq', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(groqResponse(JSON.stringify({ ...completeEmail, tone: 'custom' })));

    const result = await service().generateEmail({
      transcript,
      tone: 'custom',
      customTone: '  plus chaleureux  ',
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(String(request.body)).toContain('plus chaleureux');
    expect(result.tone).toBe('custom');
  });

  it('does not make a second LLM call for non-blocking quality warnings', async () => {
    const weakEmail = {
      ...completeEmail,
      body: transcript,
    };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(groqResponse(JSON.stringify(weakEmail)));

    const result = await service().generateEmail({
      transcript,
      language: 'fr',
      tone: 'auto',
    });

    expect(result.body).toBe(transcript);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns a controlled error when Groq JSON is invalid', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(groqResponse('not-json'))
      .mockResolvedValueOnce(groqResponse('still-not-json'));

    await expect(
      service().generateEmail({ transcript, language: 'fr', tone: 'auto' }),
    ).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
  });

  it('never falls back to raw transcript when Groq is not configured', async () => {
    await expect(
      service('').generateEmail({ transcript, language: 'fr', tone: 'auto' }),
    ).rejects.toBeInstanceOf(HttpException);
  });

  it('expands the existing email without requesting a new email', async () => {
    const original = 'Bonjour,\n\nLa réunion est prévue vendredi à 10 h.\n\nCordialement,';
    const expanded =
      'Bonjour,\n\nJe vous confirme que la réunion est bien prévue vendredi à 10 h. Ce rendez-vous nous permettra ainsi de poursuivre nos échanges dans de bonnes conditions.\n\nCordialement,';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(groqResponse(JSON.stringify({ email: expanded })));

    const result = await service().expandEmail({
      email: original,
      tone: 'professional',
      language: 'fr',
      expandLevel: 'light',
    });

    expect(result.email).toBe(expanded);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(String(request.body)).toContain('about 20%');
    expect(String(request.body)).toContain('vendredi à 10 h');
  });

  it('rejects an expansion that does not enrich the existing body', async () => {
    const original = 'Bonjour, merci de confirmer la réunion de vendredi. Cordialement.';
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(groqResponse(JSON.stringify({ email: original })));

    await expect(
      service().expandEmail({ email: original, expandLevel: 'medium' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('repairs a voice reply that only repeats its transcript', async () => {
    const instruction = 'Tell Ahmed that the application is ready and ask him to test it tomorrow.';
    const repairedReply = {
      subject: 'Re: Application status',
      body: 'Hello Ahmed,\n\nThe application is now ready. Could you please test it tomorrow and share your feedback?\n\nBest regards,',
      tone: 'professional',
      language: 'en',
    };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        groqResponse(
          JSON.stringify({
            ...repairedReply,
            body: instruction,
          }),
        ),
      )
      .mockResolvedValueOnce(groqResponse(JSON.stringify(repairedReply)));

    const result = await service().generateReply({
      originalEmail: {
        subject: 'Application status',
        body: 'Is the application ready?',
        senderName: 'Ahmed',
      },
      replyInstruction: instruction,
      language: 'en',
      tone: 'auto',
    });

    expect(result.body).toContain('Could you please test it tomorrow');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
