import { Module } from '@nestjs/common';
import { BrevoProvider } from './brevo.provider';
import { MailService } from './mail.service';

@Module({
  providers: [BrevoProvider, MailService],
  exports: [MailService],
})
export class MailModule {}
