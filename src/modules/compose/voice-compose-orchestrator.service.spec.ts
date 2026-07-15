import { VoiceComposeOrchestratorService } from './voice-compose-orchestrator.service';

describe('VoiceComposeOrchestratorService', () => {
  const file = {
    buffer: Buffer.from('audio'),
    mimetype: 'audio/m4a',
    originalname: 'voice.m4a',
    size: 5,
  };
  const speechResult = {
    transcript: 'Bonjour, merci de confirmer la réunion.',
    language: 'fr' as const,
    confidence: 0.93,
    duration: 3,
    requiresConfirmation: false,
    uncertainEntities: [],
  };

  it('preserves the transcript when AI generation fails', async () => {
    const speech = { transcribe: jest.fn().mockResolvedValue(speechResult) };
    const ai = { compose: jest.fn().mockRejectedValue(new Error('provider down')) };
    const service = new VoiceComposeOrchestratorService(speech as never, ai as never);

    await expect(service.compose(file, 'auto', 'professional')).resolves.toMatchObject({
      status: 'retryable_error',
      speech: { transcript: speechResult.transcript },
      error: { code: 'AI_GENERATION_FAILED', retryable: true },
    });
    expect(ai.compose).toHaveBeenCalledTimes(1);
  });

  it('does not invoke AI when the transcript needs confirmation', async () => {
    const speech = {
      transcribe: jest.fn().mockResolvedValue({ ...speechResult, requiresConfirmation: true }),
    };
    const ai = { compose: jest.fn() };
    const service = new VoiceComposeOrchestratorService(speech as never, ai as never);

    await expect(service.compose(file, 'auto', 'professional')).resolves.toMatchObject({
      status: 'needs_transcript_confirmation',
    });
    expect(ai.compose).not.toHaveBeenCalled();
  });
});
