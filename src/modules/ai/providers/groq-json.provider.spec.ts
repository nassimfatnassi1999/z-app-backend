import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { BusinessException } from '../../../common/errors/business-error';
import { GroqJsonProvider } from './groq-json.provider';

const emailSchema = z.object({ subject: z.string().min(2), body: z.string().min(10) }).strict();

function groqResponse(content: string, status = 200) {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function provider() {
  return new GroqJsonProvider(
    new ConfigService({
      GROQ_API_KEY: 'test-key',
      GROQ_BASE_URL: 'https://api.groq.test/openai/v1',
      GROQ_EMAIL_MODEL: 'test-model',
      GROQ_EXTRACTION_MODEL: 'test-model',
      GROQ_VALIDATION_MODEL: 'test-model',
      AI_REQUEST_TIMEOUT_MS: '1000',
    }),
  );
}

function complete(service: GroqJsonProvider) {
  return service.complete({
    kind: 'generation',
    prompt: 'Return JSON with exactly subject and body.',
    input: { transcript: 'Bonjour, confirmez la réunion.' },
    schema: emailSchema,
    temperature: 0.1,
  });
}

function expectBusinessCode(error: unknown, code: string) {
  expect(error).toBeInstanceOf(BusinessException);
  expect((error as BusinessException).getResponse()).toMatchObject({
    error: { code },
  });
}

describe('GroqJsonProvider', () => {
  afterEach(() => jest.restoreAllMocks());

  it('returns a schema-valid email response', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        groqResponse(JSON.stringify({ subject: 'Réunion', body: 'Réunion confirmée demain.' })),
      );

    await expect(complete(provider())).resolves.toMatchObject({
      value: { subject: 'Réunion', body: 'Réunion confirmée demain.' },
      model: 'test-model',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('repairs an invalid response exactly once', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(groqResponse('{invalid'))
      .mockResolvedValueOnce(
        groqResponse(JSON.stringify({ subject: 'Réunion', body: 'Réunion confirmée demain.' })),
      );

    await expect(complete(provider())).resolves.toMatchObject({
      value: { subject: 'Réunion', body: 'Réunion confirmée demain.' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body)).toContain(
      'Repair the previous response',
    );
  });

  it('rejects an invalid repair without a third request', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(groqResponse('{invalid'))
      .mockResolvedValueOnce(groqResponse(JSON.stringify({ subject: 'Sans corps' })));

    await complete(provider()).catch((error) => expectBusinessCode(error, 'AI_INVALID_OUTPUT'));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('maps provider timeout or network failure', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('timeout'));

    await complete(provider()).catch((error) => expectBusinessCode(error, 'AI_PROVIDER_TIMEOUT'));
  });

  it.each([
    [401, 'AI_PROVIDER_UNAUTHORIZED'],
    [429, 'AI_PROVIDER_RATE_LIMIT'],
    [500, 'AI_PROVIDER_ERROR'],
  ])('maps HTTP %i without reporting a fake timeout', async (status, code) => {
    jest.spyOn(global, 'fetch').mockResolvedValue(groqResponse('{}', status));

    await complete(provider()).catch((error) => expectBusinessCode(error, code));
  });
});
