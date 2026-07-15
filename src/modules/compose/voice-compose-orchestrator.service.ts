import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AiOrchestratorService } from '../ai/services/ai-orchestrator.service';
import { SpeechService } from '../speech/speech.service';

type UploadedAudio = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@Injectable()
export class VoiceComposeOrchestratorService {
  private readonly logger = new Logger(VoiceComposeOrchestratorService.name);

  constructor(
    private readonly speech: SpeechService,
    private readonly ai: AiOrchestratorService,
  ) {}

  async compose(file: UploadedAudio, language: string, tone: string) {
    const requestId = randomUUID();
    const startedAt = Date.now();
    const speech = await this.speech.transcribe(file, language);
    if (speech.requiresConfirmation) {
      return { status: 'needs_transcript_confirmation' as const, speech };
    }

    const aiStartedAt = Date.now();
    try {
      const generated = await this.ai.compose({
        transcript: speech.transcript,
        language: speech.language,
        tone,
      });
      this.logger.log(
        `requestId=${requestId} event=voice_compose_completed durationMs=${Date.now() - startedAt} sttMs=${aiStartedAt - startedAt} aiMs=${Date.now() - aiStartedAt} detectedLanguage=${speech.language}`,
      );
      return { ...generated, speech };
    } catch {
      this.logger.warn(
        `requestId=${requestId} event=voice_compose_failed code=AI_GENERATION_FAILED durationMs=${Date.now() - startedAt} sttMs=${aiStartedAt - startedAt} aiMs=${Date.now() - aiStartedAt} detectedLanguage=${speech.language}`,
      );
      return {
        status: 'retryable_error' as const,
        speech,
        error: {
          code: 'AI_GENERATION_FAILED' as const,
          message: 'La génération de l’email a échoué. Votre transcription est conservée.',
          retryable: true,
        },
      };
    }
  }
}
