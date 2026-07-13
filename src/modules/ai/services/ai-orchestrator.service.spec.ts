import { AiOrchestratorService } from './ai-orchestrator.service';

describe('AiOrchestratorService', () => {
  it('returns targeted clarification without generating', async () => {
    const extraction = {
      extract: jest
        .fn()
        .mockResolvedValue({
          value: { needsClarification: true, clarificationQuestions: ['Mardi 14 ou mardi 24 ?'] },
        }),
    };
    const generation = { generate: jest.fn() };
    const service = new AiOrchestratorService(
      extraction as never,
      generation as never,
      {} as never,
      {} as never,
    );
    await expect(service.compose({ transcript: 'Mardi...' })).resolves.toMatchObject({
      status: 'needs_clarification',
      questions: ['Mardi 14 ou mardi 24 ?'],
    });
    expect(generation.generate).not.toHaveBeenCalled();
  });
});
