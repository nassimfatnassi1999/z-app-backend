import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SendEmailDto } from './dto/send-email.dto';
import { MailboxEvents } from './mailbox.events';
import { NotificationsService } from '../notifications/notifications.service';

type MailboxFolder = 'inbox' | 'sent' | 'drafts' | 'trash' | 'favorites' | 'unread';

@Injectable()
export class MailboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: MailboxEvents,
    private readonly notifications: NotificationsService,
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
        where: {
          recipientId: userId,
          status: 'sent',
          read: false,
          recipientDeleted: false,
          recipientPurged: false,
        },
      }),
    };
  }

  async counts(userId: string) {
    const [inboxUnread, drafts, trash] = await Promise.all([
      this.prisma.email.count({
        where: {
          recipientId: userId,
          status: 'sent',
          read: false,
          recipientDeleted: false,
          recipientPurged: false,
        },
      }),
      this.prisma.emailDraft.count({ where: { userId, status: 'draft' } }),
      this.prisma.email.count({
        where: {
          OR: [
            { senderId: userId, senderDeleted: true, senderPurged: false },
            { recipientId: userId, recipientDeleted: true, recipientPurged: false },
          ],
        },
      }),
    ]);
    return { inboxUnread, unread: inboxUnread, drafts, trash };
  }

  async send(userId: string, dto: SendEmailDto) {
    if (userId === dto.recipientId) {
      throw new BadRequestException('Cannot send an email to yourself');
    }
    const recipient = await this.prisma.user.findUnique({ where: { id: dto.recipientId } });
    if (!recipient) throw new NotFoundException('Recipient not found');

    const replyTo = dto.replyToEmailId
      ? await this.findVisibleEmail(userId, dto.replyToEmailId)
      : null;
    if (replyTo && replyTo.recipientId !== userId) {
      throw new BadRequestException('Only the recipient can reply to this email');
    }
    if (replyTo && replyTo.senderId !== dto.recipientId) {
      throw new BadRequestException('Reply recipient must be the original sender');
    }
    const subject = replyTo ? this.replySubject(replyTo.subject) : dto.subject.trim();
    const email = await this.prisma.$transaction(async (tx) => {
      let transcript: string | undefined;
      if (dto.draftId) {
        const draft = await tx.emailDraft.findFirst({
          where: { id: dto.draftId, userId, status: 'draft' },
        });
        if (!draft) throw new NotFoundException('Draft not found');
        transcript = draft.transcript;
      }
      const created = await tx.email.create({
        data: {
          senderId: userId,
          recipientId: dto.recipientId,
          subject,
          body: dto.body.trim(),
          tone: dto.tone || 'professional',
          language: dto.language || 'unknown',
          transcript,
          status: 'sent',
          sentAt: new Date(),
          replyToEmailId: replyTo?.id,
          threadId: replyTo ? replyTo.threadId || replyTo.id : undefined,
        },
        include: this.emailInclude(),
      });
      if (dto.draftId) {
        await tx.emailDraft.update({
          where: { id: dto.draftId },
          data: { status: 'sent_internal' },
        });
      }
      return created;
    });
    const serialized = this.serializeEmail(email, userId);
    this.events.emitToUser(
      dto.recipientId,
      'email:new',
      this.serializeEmail(email, dto.recipientId),
    );
    await this.notifications.sendNewEmail({
      recipientId: dto.recipientId,
      senderId: userId,
      senderName: email.sender.name,
      emailId: email.id,
      subject: email.subject,
    });
    return serialized;
  }

  async detail(userId: string, id: string, includeTranscript = false) {
    const email = await this.findVisibleEmail(userId, id);
    if (email.recipientId === userId && !email.read) {
      const updated = await this.prisma.email.update({
        where: { id },
        data: { read: true, readAt: new Date() },
        include: this.emailInclude(),
      });
      this.events.emitToUser(email.senderId, 'email:read', { id });
      return this.serializeEmail(updated, userId, includeTranscript && updated.senderId === userId);
    }
    return this.serializeEmail(email, userId, includeTranscript && email.senderId === userId);
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
    const email = await this.findVisibleEmail(userId, id);
    const updated = await this.prisma.email.update({
      where: { id },
      data: email.senderId === userId ? { senderStarred: starred } : { recipientStarred: starred },
      include: this.emailInclude(),
    });
    return this.serializeEmail(updated, userId);
  }

  async delete(userId: string, id: string) {
    const email = await this.findVisibleEmail(userId, id);
    const updated = await this.prisma.email.update({
      where: { id },
      data: email.senderId === userId ? { senderDeleted: true } : { recipientDeleted: true },
      include: this.emailInclude(),
    });
    this.events.emitToUser(userId, 'email:deleted', { id });
    return this.serializeEmail(updated, userId);
  }

  async restore(userId: string, id: string) {
    const email = await this.findVisibleEmail(userId, id);
    const updated = await this.prisma.email.update({
      where: { id },
      data:
        email.senderId === userId
          ? { senderDeleted: false, senderPurged: false }
          : { recipientDeleted: false, recipientPurged: false },
      include: this.emailInclude(),
    });
    return this.serializeEmail(updated, userId);
  }

  async removePermanently(userId: string, id: string) {
    const email = await this.findVisibleEmail(userId, id, true);
    const ownDeleted = email.senderId === userId ? email.senderDeleted : email.recipientDeleted;
    if (!ownDeleted)
      throw new BadRequestException('Email must be in trash before permanent removal');
    const otherPurged = email.senderId === userId ? email.recipientPurged : email.senderPurged;
    if (otherPurged) {
      await this.prisma.email.delete({ where: { id } });
    } else {
      await this.prisma.email.update({
        where: { id },
        data: email.senderId === userId ? { senderPurged: true } : { recipientPurged: true },
      });
    }
    return { success: true };
  }

  async emptyTrash(userId: string) {
    const emails = await this.prisma.email.findMany({
      where: {
        OR: [
          { senderId: userId, senderDeleted: true, senderPurged: false },
          { recipientId: userId, recipientDeleted: true, recipientPurged: false },
        ],
      },
      select: { id: true, senderId: true, senderPurged: true, recipientPurged: true },
    });
    await this.prisma.$transaction(
      emails.map((email) => {
        const otherPurged = email.senderId === userId ? email.recipientPurged : email.senderPurged;
        return otherPurged
          ? this.prisma.email.delete({ where: { id: email.id } })
          : this.prisma.email.update({
              where: { id: email.id },
              data: email.senderId === userId ? { senderPurged: true } : { recipientPurged: true },
            });
      }),
    );
    return { deleted: emails.length };
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
        return { senderId: userId, status: 'sent', senderDeleted: false, senderPurged: false };
      case 'trash':
        return {
          OR: [
            { senderId: userId, senderDeleted: true, senderPurged: false },
            { recipientId: userId, recipientDeleted: true, recipientPurged: false },
          ],
        };
      case 'favorites':
        return {
          OR: [
            {
              senderId: userId,
              senderStarred: true,
              senderDeleted: false,
              senderPurged: false,
            },
            {
              recipientId: userId,
              recipientStarred: true,
              recipientDeleted: false,
              recipientPurged: false,
            },
          ],
        };
      case 'unread':
        return {
          recipientId: userId,
          status: 'sent',
          read: false,
          recipientDeleted: false,
          recipientPurged: false,
        };
      case 'inbox':
      default:
        return {
          recipientId: userId,
          status: 'sent',
          recipientDeleted: false,
          recipientPurged: false,
        };
    }
  }

  private async findVisibleEmail(userId: string, id: string, includePurged = false) {
    const email = await this.prisma.email.findFirst({
      where: {
        id,
        OR: [
          { senderId: userId, ...(includePurged ? {} : { senderPurged: false }) },
          { recipientId: userId, ...(includePurged ? {} : { recipientPurged: false }) },
        ],
      },
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

  private serializeEmail(email: any, currentUserId: string, includeTranscript = false) {
    const isSender = email.senderId === currentUserId;
    const result: Record<string, unknown> = {
      id: email.id,
      subject: email.subject,
      body: email.body,
      tone: email.tone,
      language: email.language,
      status: email.status,
      draft: email.status === 'draft',
      read: email.read,
      deleted: isSender ? email.senderDeleted : email.recipientDeleted,
      starred: isSender ? email.senderStarred : email.recipientStarred,
      createdAt: email.createdAt,
      updatedAt: email.updatedAt,
      readAt: email.readAt,
      sentAt: email.sentAt,
      replyToEmailId: email.replyToEmailId,
      threadId: email.threadId || email.id,
      sender: this.serializeUser(email.sender),
      recipient: this.serializeUser(email.recipient),
      preview: email.body.slice(0, 140),
      aiGenerated: Boolean(email.transcript),
      direction: isSender ? 'sent' : 'received',
    };
    if (includeTranscript) result.transcript = email.transcript;
    return result;
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

  private replySubject(originalSubject: string) {
    const subject = originalSubject.trim();
    return /^re\s*:/i.test(subject) ? subject : `Re: ${subject}`;
  }
}
