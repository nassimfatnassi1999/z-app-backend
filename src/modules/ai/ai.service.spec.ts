import { ConfigService } from '@nestjs/config';
import { emailFixture } from './testing/ai-test.fixtures';
import { AiService } from './ai.service';

function groqResponse(content: string) {
  return {
    ok: true,
    json: jest.fn().mockResolvedValue({ choices: [{ message: { content } }] }),
  } as unknown as Response;
}

describe('AiService compatibility facade', () => {
  afterEach(() => jest.restoreAllMocks());

  function service(
    orchestrator = { compose: jest.fn().mockResolvedValue({ email: emailFixture }) },
  ) {
    return {
      orchestrator,
      value: new AiService(
        new ConfigService({
          GROQ_API_KEY: 'test-key',
          GROQ_MODEL: 'test-model',
          GROQ_BASE_URL: 'https://api.groq.test/openai/v1',
          AI_REQUEST_TIMEOUT_MS: '1000',
        }),
        orchestrator as never,
      ),
    };
  }

  it('delegates legacy email generation to the two-stage orchestrator', async () => {
    const { value, orchestrator } = service();
    const result = await value.generateEmail({
      transcript: 'Informer Ahmed de mon absence demain matin.',
      language: 'fr',
      tone: 'auto',
    });
    expect(orchestrator.compose).toHaveBeenCalledWith(
      expect.objectContaining({ transcript: expect.any(String), language: 'fr', tone: 'auto' }),
    );
    expect(result).toMatchObject({
      language: 'fr',
      tone: 'professional',
      intent: 'information',
      subject: emailFixture.subject,
    });
  });

  it('repairs a voice reply that only repeats its instruction', async () => {
    const instruction = 'Tell Ahmed that the application is ready and ask him to test it tomorrow.';
    const repairedReply = {
      subject: 'Re: Application status',
      body: 'Hello Ahmed,\n\nThe application is now ready. Could you please test it tomorrow?\n\nBest regards,',
      tone: 'professional',
      language: 'en',
    };
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(groqResponse(JSON.stringify({ ...repairedReply, body: instruction })))
      .mockResolvedValueOnce(groqResponse(JSON.stringify(repairedReply)));
    const result = await service().value.generateReply({
      originalEmail: { subject: 'Application status', body: 'Is it ready?', senderName: 'Ahmed' },
      replyInstruction: instruction,
      language: 'en',
      tone: 'auto',
    });
    expect(result.body).toContain('test it tomorrow');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
