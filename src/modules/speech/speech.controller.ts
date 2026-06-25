import {
  Body,
  BadRequestException,
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { SpeechService } from './speech.service';

@ApiTags('speech')
@Controller('speech')
export class SpeechController {
  constructor(private readonly speech: SpeechService) {}

  @Post('transcribe')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'audio', maxCount: 1 },
      { name: 'file', maxCount: 1 },
    ]),
  )
  transcribe(
    @UploadedFiles() files: { audio?: any[]; file?: any[] },
    @Body('language') language = 'auto',
  ) {
    const file = files.audio?.[0] ?? files.file?.[0];
    if (!file) {
      throw new BadRequestException('Aucun fichier audio reçu.');
    }

    return this.speech.transcribe(file, language);
  }
}
