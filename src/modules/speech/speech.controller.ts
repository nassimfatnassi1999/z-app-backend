import {
  Body,
  BadRequestException,
  Controller,
  Req,
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
import { Request } from 'express';
import { VoiceEmailDto } from './dto/voice-email.dto';

const MAX_AUDIO_BYTES = 12 * 1024 * 1024;

@ApiTags('speech')
@Controller('speech')
export class SpeechController {
  constructor(private readonly speech: SpeechService) {}

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
    @Body() dto: VoiceEmailDto,
    @Req() request: Request & { user?: { sub?: string }; requestId?: string },
  ) {
    const file = files.audio?.[0] ?? files.file?.[0];
    if (!file) {
      throw new BadRequestException('Aucun fichier audio reçu.');
    }

    return this.speech.transcribe(file, dto.speechLanguageMode || dto.language || 'auto', {
      requestId: request.requestId,
      actorId: request.user?.sub || request.header('x-device-id'),
    });
  }
}
