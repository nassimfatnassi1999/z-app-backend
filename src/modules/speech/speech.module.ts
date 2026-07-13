import { Module } from '@nestjs/common';
import { SpeechController } from './speech.controller';
import { SpeechService } from './speech.service';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';

@Module({
  controllers: [SpeechController],
  providers: [SpeechService, IdempotencyService],
  exports: [SpeechService],
})
export class SpeechModule {}
