import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MailboxEvents } from './mailbox.events';

type AuthSocket = Socket & { user?: { userId: string; email: string } };

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class MailboxGateway implements OnGatewayConnection, OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly events: MailboxEvents,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  afterInit(server: Server) {
    this.events.bind(server);
  }

  async handleConnection(client: AuthSocket) {
    const token = this.tokenFrom(client);
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string }>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      client.user = { userId: payload.sub, email: payload.email };
      await client.join(this.events.room(payload.sub));
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('mailbox:join')
  async join(@ConnectedSocket() client: AuthSocket) {
    if (!client.user?.userId) return { ok: false };
    await client.join(this.events.room(client.user.userId));
    return { ok: true };
  }

  private tokenFrom(client: Socket) {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string') return authToken;
    const header = client.handshake.headers.authorization;
    return typeof header === 'string' ? header.replace(/^Bearer\s+/i, '') : '';
  }
}
