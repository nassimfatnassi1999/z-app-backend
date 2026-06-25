import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailProvider, VerificationEmailParams } from './mail.interface';

@Injectable()
export class BrevoProvider implements MailProvider {
  constructor(private readonly config: ConfigService) {}

  async sendVerificationEmail(params: VerificationEmailParams): Promise<void> {
    const apiKey = this.config.get<string>('BREVO_API_KEY');
    const fromEmail = this.config.get<string>('BREVO_FROM_EMAIL');
    const fromName = this.config.get<string>('BREVO_FROM_NAME') || 'Z';
    const replyTo = this.config.get<string>('BREVO_REPLY_TO');

    if (!apiKey || !fromEmail) {
      throw new ServiceUnavailableException('Brevo mail configuration is missing');
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email: params.to, name: params.name }],
        replyTo: replyTo ? { email: replyTo } : undefined,
        subject: 'Votre code de vérification Z',
        htmlContent: this.htmlTemplate(params),
        textContent: this.textTemplate(params),
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException('Unable to send verification email');
    }
  }

  private textTemplate(params: VerificationEmailParams) {
    return [
      'Bonjour,',
      '',
      `Votre code de vérification Z est : ${params.code}`,
      '',
      `Ce code expire dans ${params.expiresInMinutes} minutes.`,
      '',
      "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
      '',
      'Z',
      'Parlez. Z rédige.',
    ].join('\n');
  }

  private htmlTemplate(params: VerificationEmailParams) {
    return `
      <html>
        <body style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5;">
          <div style="max-width: 520px; margin: 0 auto; padding: 24px;">
            <h1 style="margin: 0 0 8px; color: #2563eb;">Z</h1>
            <p style="margin: 0 0 24px;">Parlez. Z rédige.</p>
            <h2>Votre code de vérification</h2>
            <p>Bonjour${params.name ? ` ${params.name}` : ''},</p>
            <p>Entrez ce code dans Z pour vérifier votre adresse e-mail.</p>
            <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; padding: 16px; background: #f3f4f6; text-align: center; border-radius: 8px;">
              ${params.code}
            </div>
            <p>Ce code expire dans ${params.expiresInMinutes} minutes.</p>
            <p style="font-size: 13px; color: #6b7280;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
          </div>
        </body>
      </html>
    `;
  }
}
