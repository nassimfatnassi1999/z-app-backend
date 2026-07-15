import { AiOrchestratorService } from './ai-orchestrator.service';
import { FactualConsistencyService } from './factual-consistency.service';

const extractionValue = {
  language: 'fr',
  intent: 'Informer',
  recipient: 'Ahmed',
  facts: ['Absent demain matin', 'Retour vers midi'],
  constraints: [],
  requestedActions: [],
  dates: ['demain matin'],
  amounts: [],
  names: ['Ahmed'],
  tone: 'professional',
  ambiguities: [],
  needsClarification: false,
  clarificationQuestions: [],
};

const passingValidation = {
  supportedFacts: true,
  missingFacts: [],
  unsupportedClaims: [],
  negationPreserved: true,
  languageMatch: true,
  toneMatch: true,
  actionClear: true,
  pass: true,
};

describe('AiOrchestratorService', () => {
  it('repairs an email that introduces a new name', async () => {
    const extraction = { extract: jest.fn().mockResolvedValue({ value: extractionValue }) };
    const generation = {
      generate: jest.fn().mockResolvedValue({
        model: 'test-model',
        value: {
          subject: 'Absence',
          body: 'Bonjour Ahmed. Le projet Atlas continue. Je serai absent demain matin.',
          language: 'fr',
          tone: 'professional',
          intent: 'Informer',
          recipientSuggestion: 'Ahmed',
        },
      }),
    };
    const repaired = {
      subject: 'Message',
      body: 'Bonjour Ahmed. Je serai absent demain matin et reviendrai vers midi.',
      language: 'fr',
      tone: 'professional',
      intent: 'Informer',
      recipientSuggestion: 'Ahmed',
    };
    const repair = { repair: jest.fn().mockResolvedValue({ value: repaired }) };
    const validation = { validate: jest.fn().mockResolvedValue(passingValidation) };
    const service = new AiOrchestratorService(
      extraction as never,
      generation as never,
      validation as never,
      repair as never,
      new FactualConsistencyService(),
    );

    const result = await service.compose({
      transcript: 'Bonjour Ahmed. Je serai absent demain matin. Je reviendrai vers midi.',
    });

    expect(repair.repair).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      status: 'completed',
      email: repaired,
      metadata: { retryUsed: true, fallbackUsed: false },
    });
  });

  it('returns the transcript as a minimal safe fallback after two rejected outputs', async () => {
    const transcript = 'Je serai absent demain matin.';
    const unsafe = {
      subject: 'Réunion Atlas',
      body: 'Je serai absent demain matin pour rencontrer Sarah à Paris.',
      language: 'fr',
      tone: 'professional',
      intent: 'Informer',
      recipientSuggestion: null,
    };
    const service = new AiOrchestratorService(
      { extract: jest.fn().mockResolvedValue({ value: extractionValue }) } as never,
      { generate: jest.fn().mockResolvedValue({ model: 'test-model', value: unsafe }) } as never,
      { validate: jest.fn().mockResolvedValue(passingValidation) } as never,
      { repair: jest.fn().mockResolvedValue({ value: unsafe }) } as never,
      new FactualConsistencyService(),
    );

    const result = await service.compose({ transcript });

    expect(result.email.body).toBe(transcript);
    expect(result.email.subject).toBe('Message');
    expect(result.metadata.fallbackUsed).toBe(true);
  });
});
