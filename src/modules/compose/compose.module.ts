import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SpeechModule } from '../speech/speech.module';
import { ComposeController } from './compose.controller';
import { VoiceComposeOrchestratorService } from './voice-compose-orchestrator.service';

@Module({
  imports: [AiModule, SpeechModule],
  controllers: [ComposeController],
  providers: [VoiceComposeOrchestratorService],
})
export class ComposeModule {}
