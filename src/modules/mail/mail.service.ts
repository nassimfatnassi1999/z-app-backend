import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoProvider } from './brevo.provider';
import { VerificationEmailParams } from './mail.interface';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly brevo: BrevoProvider,
  ) {}

  async sendVerificationEmail(params: VerificationEmailParams): Promise<void> {
    const enabled = this.config.get<string>('MAIL_ENABLED') === 'true';
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';

    if (!enabled) {
      if (isProduction) {
        throw new ServiceUnavailableException('Mail delivery is disabled in production');
      }
      this.logger.warn(`DEV EMAIL VERIFICATION CODE for ${params.to}: ${params.code}`);
      return;
    }

    const provider = this.config.get<string>('MAIL_PROVIDER') || 'brevo';
    if (provider !== 'brevo') {
      throw new ServiceUnavailableException('Unsupported mail provider');
    }

    await this.brevo.sendVerificationEmail(params);
  }
}
