import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { AiOrchestratorService } from '../ai/services/ai-orchestrator.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SpeechService } from '../speech/speech.service';

type UploadedAudio = { buffer: Buffer; mimetype: string; originalname: string; size: number };

@ApiTags('compose')
@Controller('compose')
export class ComposeController {
  constructor(
    private readonly speech: SpeechService,
    private readonly ai: AiOrchestratorService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('from-audio')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'audio', maxCount: 1 },
        { name: 'file', maxCount: 1 },
      ],
      { limits: { fileSize: 12 * 1024 * 1024, files: 1, fields: 3 } },
    ),
  )
  compose(
    @UploadedFiles() files: { audio?: UploadedAudio[]; file?: UploadedAudio[] },
    @Body('language') language = 'auto',
    @Body('tone') tone = 'professional',
    @Headers('idempotency-key') key?: string,
  ) {
    const file = files.audio?.[0] ?? files.file?.[0];
    if (!file)
      throw new BadRequestException({
        success: false,
        error: { code: 'AUDIO_EMPTY', message: 'Aucun fichier audio reçu.', retryable: true },
      });
    return this.idempotency.run('compose:audio', key, async () => {
      const speech = await this.speech.transcribe(file, language);
      if (speech.requiresConfirmation) return { status: 'needs_transcript_confirmation', speech };
      return {
        ...(await this.ai.compose({
          transcript: speech.transcript,
          language: speech.language,
          tone,
        })),
        speech,
      };
    });
  }
}
