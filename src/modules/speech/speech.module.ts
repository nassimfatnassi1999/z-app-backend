import { Module } from '@nestjs/common';
import { SpeechController } from './speech.controller';
import { SpeechService } from './speech.service';
import { SPEECH_TO_TEXT_PROVIDER } from './speech.types';

@Module({
  controllers: [SpeechController],
  providers: [SpeechService, { provide: SPEECH_TO_TEXT_PROVIDER, useExisting: SpeechService }],
})
export class SpeechModule {}
