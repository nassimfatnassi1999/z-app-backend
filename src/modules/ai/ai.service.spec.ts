import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';

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
    return new AiService(
      new ConfigService({
        GROQ_API_KEY: apiKey,
        GROQ_MODEL: 'test-model',
      }),
    );
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
  ])(
    'preserves the automatically detected %s classification',
    async (tone) => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(groqResponse(JSON.stringify({ ...completeEmail, tone })));

      const result = await service().generateEmail({ transcript, tone: 'auto' });

      expect(result.tone).toBe(tone);
    },
  );

  it('requires an instruction for a custom tone', async () => {
    await expect(
      service().generateEmail({ transcript, tone: 'custom', customTone: '  ' }),
    ).rejects.toMatchObject({
      message: 'customTone is required when tone is custom',
    });
  });

  it('sends the selected custom instruction to Groq', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        groqResponse(JSON.stringify({ ...completeEmail, tone: 'custom' })),
      );

    const result = await service().generateEmail({
      transcript,
      tone: 'custom',
      customTone: '  plus chaleureux  ',
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(String(request.body)).toContain('plus chaleureux');
    expect(result.tone).toBe('custom');
  });

  it('retries once when Groq returns the raw transcript', async () => {
    const weakEmail = {
      ...completeEmail,
      body: transcript,
    };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(groqResponse(JSON.stringify(weakEmail)))
      .mockResolvedValueOnce(groqResponse(JSON.stringify(completeEmail)));

    const result = await service().generateEmail({
      transcript,
      language: 'fr',
      tone: 'auto',
    });

    expect(result.body).toBe(completeEmail.body);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries invalid JSON, then returns a clear error for another weak output', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(groqResponse('not-json'))
      .mockResolvedValueOnce(
        groqResponse(
          JSON.stringify({
            ...completeEmail,
            subject: '',
            body: 'Congé vendredi.',
          }),
        ),
      );

    await expect(
      service().generateEmail({ transcript, language: 'fr', tone: 'auto' }),
    ).rejects.toMatchObject({
      message: 'La génération IA a échoué. Réessayez.',
    });
  });

  it('never falls back to raw transcript when Groq is not configured', async () => {
    await expect(
      service('').generateEmail({ transcript, language: 'fr', tone: 'auto' }),
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
