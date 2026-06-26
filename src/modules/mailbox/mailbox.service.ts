import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SendEmailDto } from './dto/send-email.dto';
import { MailboxEvents } from './mailbox.events';

type MailboxFolder = 'inbox' | 'sent' | 'drafts' | 'trash' | 'favorites' | 'unread';

@Injectable()
export class MailboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: MailboxEvents,
  ) {}

  async list(userId: string, folder: MailboxFolder = 'inbox', q = '') {
    if (folder === 'drafts') return this.listDrafts(userId, q);

    const query = q.trim();
    const search =
      query.length > 0
        ? {
            OR: [
              { subject: { contains: query, mode: 'insensitive' as const } },
              { body: { contains: query, mode: 'insensitive' as const } },
              { transcript: { contains: query, mode: 'insensitive' as const } },
              { sender: { name: { contains: query, mode: 'insensitive' as const } } },
              { sender: { email: { contains: query, mode: 'insensitive' as const } } },
              { recipient: { name: { contains: query, mode: 'insensitive' as const } } },
              { recipient: { email: { contains: query, mode: 'insensitive' as const } } },
            ],
          }
        : {};

    const where = {
      ...search,
      ...this.folderWhere(userId, folder),
    };

    const emails = await this.prisma.email.findMany({
      where,
      include: this.emailInclude(),
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return emails.map((email) => this.serializeEmail(email, userId));
  }

  async unreadCount(userId: string) {
    return {
      unread: await this.prisma.email.count({
        where: { recipientId: userId, read: false, deleted: false },
      }),
    };
  }

  async send(userId: string, dto: SendEmailDto) {
    if (userId === dto.recipientId) {
      throw new BadRequestException('Cannot send an email to yourself');
    }
    const recipient = await this.prisma.user.findUnique({ where: { id: dto.recipientId } });
    if (!recipient) throw new NotFoundException('Recipient not found');

    const email = await this.prisma.email.create({
      data: {
        senderId: userId,
        recipientId: dto.recipientId,
        subject: dto.subject.trim(),
        body: dto.body.trim(),
        transcript: dto.transcript?.trim() || null,
        tone: dto.tone || 'professional',
        language: dto.language || 'unknown',
        status: 'sent',
      },
      include: this.emailInclude(),
    });
    const serialized = this.serializeEmail(email, userId);
    this.events.emitToUser(
      dto.recipientId,
      'email:new',
      this.serializeEmail(email, dto.recipientId),
    );
    return serialized;
  }

  async detail(userId: string, id: string) {
    const email = await this.findVisibleEmail(userId, id);
    if (email.recipientId === userId && !email.read) {
      const updated = await this.prisma.email.update({
        where: { id },
        data: { read: true, readAt: new Date() },
        include: this.emailInclude(),
      });
      this.events.emitToUser(email.senderId, 'email:read', { id });
      return this.serializeEmail(updated, userId);
    }
    return this.serializeEmail(email, userId);
  }

  async markRead(userId: string, id: string, read = true) {
    const email = await this.findVisibleEmail(userId, id);
    if (email.recipientId !== userId) throw new ForbiddenException('Only recipients can mark read');
    const updated = await this.prisma.email.update({
      where: { id },
      data: { read, readAt: read ? new Date() : null },
      include: this.emailInclude(),
    });
    this.events.emitToUser(email.senderId, 'email:read', { id, read });
    return this.serializeEmail(updated, userId);
  }

  async star(userId: string, id: string, starred: boolean) {
    await this.findVisibleEmail(userId, id);
    const updated = await this.prisma.email.update({
      where: { id },
      data: { starred },
      include: this.emailInclude(),
    });
    return this.serializeEmail(updated, userId);
  }

  async delete(userId: string, id: string) {
    await this.findVisibleEmail(userId, id);
    const updated = await this.prisma.email.update({
      where: { id },
      data: { deleted: true, status: 'deleted' },
      include: this.emailInclude(),
    });
    this.events.emitToUser(userId, 'email:deleted', { id });
    return this.serializeEmail(updated, userId);
  }

  async restore(userId: string, id: string) {
    await this.findVisibleEmail(userId, id);
    const updated = await this.prisma.email.update({
      where: { id },
      data: { deleted: false, status: 'sent' },
      include: this.emailInclude(),
    });
    return this.serializeEmail(updated, userId);
  }

  async removePermanently(userId: string, id: string) {
    await this.findVisibleEmail(userId, id);
    await this.prisma.email.delete({ where: { id } });
    return { success: true };
  }

  async emptyTrash(userId: string) {
    const result = await this.prisma.email.deleteMany({
      where: {
        deleted: true,
        OR: [{ senderId: userId }, { recipientId: userId }],
      },
    });
    return { deleted: result.count };
  }

  private async listDrafts(userId: string, q: string) {
    const query = q.trim();
    const drafts = await this.prisma.emailDraft.findMany({
      where: {
        userId,
        status: 'draft',
        ...(query
          ? {
              OR: [
                { subject: { contains: query, mode: 'insensitive' } },
                { body: { contains: query, mode: 'insensitive' } },
                { transcript: { contains: query, mode: 'insensitive' } },
                { recipient: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return drafts.map((draft) => ({
      id: draft.id,
      subject: draft.subject,
      body: draft.body,
      transcript: draft.transcript,
      tone: draft.tone,
      language: 'unknown',
      status: draft.status,
      draft: true,
      read: true,
      deleted: false,
      starred: false,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      sender: null,
      recipient: draft.recipient ? { email: draft.recipient } : null,
      preview: draft.body.slice(0, 140),
      aiGenerated: true,
    }));
  }

  private folderWhere(userId: string, folder: MailboxFolder) {
    switch (folder) {
      case 'sent':
        return { senderId: userId, deleted: false };
      case 'trash':
        return { deleted: true, OR: [{ senderId: userId }, { recipientId: userId }] };
      case 'favorites':
        return {
          starred: true,
          deleted: false,
          OR: [{ senderId: userId }, { recipientId: userId }],
        };
      case 'unread':
        return { recipientId: userId, read: false, deleted: false };
      case 'inbox':
      default:
        return { recipientId: userId, deleted: false };
    }
  }

  private async findVisibleEmail(userId: string, id: string) {
    const email = await this.prisma.email.findFirst({
      where: { id, OR: [{ senderId: userId }, { recipientId: userId }] },
      include: this.emailInclude(),
    });
    if (!email) throw new NotFoundException('Email not found');
    return email;
  }

  private emailInclude() {
    return {
      sender: { select: { id: true, name: true, username: true, email: true } },
      recipient: { select: { id: true, name: true, username: true, email: true } },
    };
  }

  private serializeEmail(email: any, currentUserId: string) {
    return {
      id: email.id,
      subject: email.subject,
      body: email.body,
      transcript: email.transcript,
      tone: email.tone,
      language: email.language,
      status: email.status,
      draft: email.status === 'draft',
      read: email.read,
      deleted: email.deleted,
      starred: email.starred,
      createdAt: email.createdAt,
      updatedAt: email.updatedAt,
      readAt: email.readAt,
      sender: this.serializeUser(email.sender),
      recipient: this.serializeUser(email.recipient),
      preview: email.body.slice(0, 140),
      aiGenerated: Boolean(email.transcript || email.tone),
      direction: email.senderId === currentUserId ? 'sent' : 'received',
    };
  }

  private serializeUser(user: any) {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      avatarInitials: this.initials(user.name),
    };
  }

  private initials(name: string) {
    return name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }
}
