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
    this.logger.log(
      `Notification module initialized; Firebase Admin ${this.app ? 'ready' : 'disabled'}.`,
    );
  }

  async sendNewEmail(tokens: string[], payload: NewEmailPush): Promise<PushResult> {
    if (!tokens.length) return { invalidTokens: [] };
    if (!this.app) {
      const environment = this.config.get('NODE_ENV') ?? 'development';
      if (!this.warned) {
        this.logger.warn(`Firebase Admin is not configured; push skipped (${environment}).`);
        this.warned = true;
      }
      if (environment !== 'production') {
        this.logger.debug(`Development push payload: ${JSON.stringify(payload)}`);
      }
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
    this.logger.log(
      `FCM send result: ${response.successCount} succeeded, ${response.failureCount} failed.`,
    );
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
      if (getApps().length) {
        this.logger.log('Firebase Admin initialized from existing app.');
        return getApps()[0];
      }
      const encoded = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON_BASE64');
      if (encoded) {
        const app = initializeApp({
          credential: cert(JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))),
        });
        this.logger.log('Firebase Admin initialized from base64 service account.');
        return app;
      }
      const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
      const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
      const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
      if (!projectId || !clientEmail || !privateKey) return undefined;
      const app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
      this.logger.log('Firebase Admin initialized from environment fields.');
      return app;
    } catch (error) {
      this.logger.warn(`Firebase Admin initialization failed: ${(error as Error).message}`);
      return undefined;
    }
  }
}
