import { Injectable } from '@nestjs/common';
import { GenerateEmailDto } from './dto/generate-email.dto';
import { GenerateReplyDto } from './dto/generate-reply.dto';
import { AiOrchestratorService } from './services/ai-orchestrator.service';

@Injectable()
export class AiService {
  constructor(private readonly orchestrator: AiOrchestratorService) {}

  async generateEmail(dto: GenerateEmailDto) {
    const result = await this.orchestrator.compose({
      transcript: dto.transcript,
      language: dto.requestedOutputLanguage || dto.language,
      tone: dto.tone === 'custom' ? dto.customTone : dto.tone,
      recipient: dto.recipientName || dto.relationship,
      length: dto.length,
      previousEmail: dto.currentBody,
      requestId: dto.requestId,
    });
    return result.email;
  }

  async generateReply(dto: GenerateReplyDto) {
    const subject = /^re:/i.test(dto.originalEmail.subject.trim())
      ? dto.originalEmail.subject.trim()
      : `Re: ${dto.originalEmail.subject.trim()}`;
    const result = await this.orchestrator.compose({
      transcript: dto.replyInstruction,
      language: dto.language,
      tone: dto.tone === 'custom' ? dto.customTone : dto.tone,
      recipient: dto.originalEmail.senderName,
      previousEmail: JSON.stringify({
        subject: dto.originalEmail.subject,
        body: dto.originalEmail.body,
        senderName: dto.originalEmail.senderName,
      }),
    });
    return {
      subject,
      body: result.email.body,
      tone: result.email.detectedTone,
      language: result.email.detectedLanguage,
    };
  }
}
