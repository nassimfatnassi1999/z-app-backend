import { ConfigService } from '@nestjs/config';
import { AIAnalysisService } from './ai-analysis.service';
import { PromptBuilderService } from './prompt-builder.service';

describe('AIAnalysisService model wiring', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends GPT-OSS as the primary analysis model', async () => {
    const analysis = {
      sourceLanguage: 'fr',
      outputLanguage: 'fr',
      outputLanguageSource: 'detected_language',
      emailType: 'other',
      mainIntent: 'Informer',
      recipient: {},
      sender: {},
      tone: 'professional',
      requestedLength: 'short',
      subjectGoal: 'Information',
      facts: [],
      dates: [],
      amounts: [],
      locations: [],
      actionRequested: null,
      deadline: null,
      attachmentsMentioned: [],
      constraints: [],
      sensitiveDetails: [],
      ambiguousDetails: [],
      missingCriticalInformation: [],
      mustNotInvent: [],
      confidence: 0.9,
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: jest
        .fn()
        .mockResolvedValue({ choices: [{ message: { content: JSON.stringify(analysis) } }] }),
    } as unknown as Response);
    const service = new AIAnalysisService(
      new ConfigService({
        GROQ_API_KEY: 'test-key',
        GROQ_PRIMARY_MODEL: 'openai/gpt-oss-120b',
        GROQ_FALLBACK_MODEL: 'llama-3.3-70b-versatile',
      }),
      new PromptBuilderService(),
    );

    const result = await service.analyze(
      'Bonjour',
      'Bonjour',
      { transcript: 'Bonjour' },
      'request',
    );
    const requestBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(requestBody.model).toBe('openai/gpt-oss-120b');
    expect(result).toMatchObject({ model: 'openai/gpt-oss-120b', fallbackUsed: false });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
