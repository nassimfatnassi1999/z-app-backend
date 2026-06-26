import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class MailboxEvents {
  private server?: Server;

  bind(server: Server) {
    this.server = server;
  }

  emitToUser(userId: string, event: string, payload: unknown) {
    this.server?.to(this.room(userId)).emit(event, payload);
  }

  room(userId: string) {
    return `user:${userId}`;
  }
}
