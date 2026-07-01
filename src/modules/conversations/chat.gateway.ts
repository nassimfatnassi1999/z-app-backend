import { UsePipes, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ConversationsService } from './conversations.service';

type AuthSocket = Socket & { user?: { userId: string; email: string } };

@WebSocketGateway({ cors: { origin: true, credentials: true } })
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly conversations: ConversationsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: AuthSocket) {
    const token = this.tokenFrom(client);
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string }>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });
      client.user = { userId: payload.sub, email: payload.email };
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage('conversation:join')
  async join(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    const userId = this.userId(client);
    await this.conversations.assertParticipant(userId, body.conversationId);
    await client.join(this.room(body.conversationId));
    return { ok: true };
  }

  @SubscribeMessage('conversation:leave')
  async leave(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    await client.leave(this.room(body.conversationId));
    return { ok: true };
  }

  @SubscribeMessage('message:send')
  async send(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody()
    body: { conversationId: string; content: string; messageType?: 'text' | 'generated_email' },
  ) {
    this.assertSocketRate(client, 'message', 30);
    const message = await this.conversations.sendMessage(
      this.userId(client),
      body.conversationId,
      body.content,
      body.messageType ?? 'text',
    );
    this.server.to(this.room(body.conversationId)).emit('message:new', message);
    this.server.to(this.room(body.conversationId)).emit('conversation:updated', {
      conversationId: body.conversationId,
      lastMessage: message,
    });
    return message;
  }

  @SubscribeMessage('typing:start')
  async typingStart(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    this.assertSocketRate(client, 'typing', 120);
    await this.conversations.assertParticipant(this.userId(client), body.conversationId);
    client.to(this.room(body.conversationId)).emit('typing:update', {
      conversationId: body.conversationId,
      userId: this.userId(client),
      typing: true,
    });
  }

  @SubscribeMessage('typing:stop')
  async typingStop(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    this.assertSocketRate(client, 'typing', 120);
    await this.conversations.assertParticipant(this.userId(client), body.conversationId);
    client.to(this.room(body.conversationId)).emit('typing:update', {
      conversationId: body.conversationId,
      userId: this.userId(client),
      typing: false,
    });
  }

  @SubscribeMessage('message:read')
  async read(
    @ConnectedSocket() client: AuthSocket,
    @MessageBody() body: { conversationId: string },
  ) {
    await this.conversations.markRead(this.userId(client), body.conversationId);
    this.server.to(this.room(body.conversationId)).emit('message:read', {
      conversationId: body.conversationId,
      userId: this.userId(client),
    });
  }

  private tokenFrom(client: Socket) {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string') return authToken;
    const header = client.handshake.headers.authorization;
    return typeof header === 'string' ? header.replace(/^Bearer\s+/i, '') : '';
  }

  private userId(client: AuthSocket) {
    if (!client.user?.userId) {
      client.disconnect(true);
      throw new Error('Unauthenticated socket');
    }
    return client.user.userId;
  }

  private room(conversationId: string) {
    return `conversation:${conversationId}`;
  }

  private assertSocketRate(client: Socket, action: string, limit: number) {
    const now = Date.now();
    const key = `rate:${action}`;
    const current = client.data[key] as { count: number; resetAt: number } | undefined;
    if (!current || current.resetAt <= now) {
      client.data[key] = { count: 1, resetAt: now + 60_000 };
      return;
    }
    current.count += 1;
    if (current.count > limit) throw new Error('Socket rate limit exceeded');
  }
}
