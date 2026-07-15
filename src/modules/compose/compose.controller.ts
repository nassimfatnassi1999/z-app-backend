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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VoiceComposeOrchestratorService } from './voice-compose-orchestrator.service';

type UploadedAudio = { buffer: Buffer; mimetype: string; originalname: string; size: number };

@ApiTags('compose')
@Controller('compose')
export class ComposeController {
  constructor(
    private readonly orchestrator: VoiceComposeOrchestratorService,
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
      return this.orchestrator.compose(file, language, tone);
    });
  }
}
