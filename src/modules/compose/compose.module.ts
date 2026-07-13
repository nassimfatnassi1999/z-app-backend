import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SpeechModule } from '../speech/speech.module';
import { ComposeController } from './compose.controller';

@Module({ imports: [AiModule, SpeechModule], controllers: [ComposeController] })
export class ComposeModule {}
