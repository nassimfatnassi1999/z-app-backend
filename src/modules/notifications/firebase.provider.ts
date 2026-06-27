import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { NewEmailPush, PushProvider, PushResult } from './push.provider';

@Injectable()
export class FirebaseProvider implements PushProvider {
  private readonly logger = new Logger(FirebaseProvider.name);
  private app?: App;
  private warned = false;

  constructor(private readonly config: ConfigService) {
    this.app = this.createApp();
  }

  async sendNewEmail(tokens: string[], payload: NewEmailPush): Promise<PushResult> {
    if (!tokens.length) return { invalidTokens: [] };
    if (!this.app) {
      if (!this.warned) {
        this.logger.warn(
          `Firebase Admin is not configured; push skipped (${this.config.get('NODE_ENV') ?? 'development'}).`,
        );
        this.warned = true;
      }
      this.logger.debug(`Push payload: ${JSON.stringify(payload)}`);
      return { invalidTokens: [] };
    }
    const response = await getMessaging(this.app).sendEachForMulticast({
      tokens,
      notification: { title: `Nouveau mail de ${payload.senderName}`, body: payload.subject },
      data: { type: 'email_new', emailId: payload.emailId, folder: 'inbox' },
      android: {
        priority: 'high',
        notification: { channelId: 'z_mail', sound: payload.sound ? 'default' : undefined },
      },
      apns: { payload: { aps: { sound: payload.sound ? 'default' : undefined } } },
    });
    const invalidTokens: string[] = [];
    response.responses.forEach((item, index) => {
      const code = item.error?.code;
      if (
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/registration-token-not-registered'
      )
        invalidTokens.push(tokens[index]);
    });
    if (response.failureCount > invalidTokens.length)
      this.logger.warn(`FCM delivered ${response.successCount}/${tokens.length} notifications.`);
    return { invalidTokens };
  }

  private createApp(): App | undefined {
    try {
      if (getApps().length) return getApps()[0];
      const encoded = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON_BASE64');
      if (encoded)
        return initializeApp({
          credential: cert(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))),
        });
      const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
      if (!projectId || !clientEmail || !privateKey) return undefined;
      return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    } catch (error) {
      this.logger.warn(`Firebase Admin initialization failed: ${(error as Error).message}`);
      return undefined;
    }
  }
}
