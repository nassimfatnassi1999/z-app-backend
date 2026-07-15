import {
  Body,
  Controller,
  Headers,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { SpeechService } from './speech.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { BusinessException } from '../../common/errors/business-error';

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

@ApiTags('speech')
@Controller('speech')
export class SpeechController {
  constructor(
    private readonly speech: SpeechService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('transcribe')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'audio', maxCount: 1 },
        { name: 'file', maxCount: 1 },
      ],
      { limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 2 } },
    ),
  )
  transcribe(
    @UploadedFiles() files: { audio?: any[]; file?: any[] },
    @Body('language') language = 'auto',
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const file = files.audio?.[0] ?? files.file?.[0];
    if (!file) {
      throw new BusinessException('AUDIO_INVALID', 'Aucun fichier audio valide reçu.', false);
    }
    if ((file.size ?? file.buffer?.length ?? 0) > MAX_AUDIO_BYTES) {
      throw new BusinessException(
        'AUDIO_TOO_LARGE',
        'L’enregistrement est trop volumineux.',
        false,
      );
    }

    return this.idempotency.run('speech:transcribe', idempotencyKey, () =>
      this.speech.transcribe(file, language),
    );
  }
}
