import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrOpenDirect(currentUserId: string, targetUserId: string) {
    if (currentUserId === targetUserId) {
      throw new BadRequestException('Cannot create a conversation with yourself');
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) throw new NotFoundException('User not found');

    const directKey = this.directKey(currentUserId, targetUserId);
    const existing = await this.prisma.conversation.findFirst({
      where: {
        OR: [
          { directKey },
          {
            type: 'direct',
            participants: { every: { userId: { in: [currentUserId, targetUserId] } } },
            AND: [
              { participants: { some: { userId: currentUserId } } },
              { participants: { some: { userId: targetUserId } } },
            ],
          },
        ],
      },
      include: this.conversationInclude(currentUserId),
    });
    if (existing) {
      if (!existing.directKey) {
        await this.prisma.conversation.update({ where: { id: existing.id }, data: { directKey } });
      }
      return this.serializeConversation(existing, currentUserId, 0);
    }

    try {
      const conversation = await this.prisma.conversation.create({
        data: {
          type: 'direct',
          directKey,
          participants: {
            create: [{ userId: currentUserId }, { userId: targetUserId }],
          },
        },
        include: this.conversationInclude(currentUserId),
      });
      return this.serializeConversation(conversation, currentUserId, 0);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const conversation = await this.prisma.conversation.findUniqueOrThrow({
          where: { directKey },
          include: this.conversationInclude(currentUserId),
        });
        return this.serializeConversation(conversation, currentUserId, 0);
      }
      throw error;
    }
  }

  async list(currentUserId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId: currentUserId } } },
      include: this.conversationInclude(currentUserId),
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
    });
    const unread = await this.prisma.$queryRaw<Array<{ conversationId: string; count: bigint }>>`
      SELECT m."conversationId", COUNT(*) AS count
      FROM "Message" m
      JOIN "ConversationParticipant" cp
        ON cp."conversationId" = m."conversationId" AND cp."userId" = ${currentUserId}
      WHERE m."senderId" <> ${currentUserId}
        AND m."deletedAt" IS NULL
        AND (cp."lastReadAt" IS NULL OR m."createdAt" > cp."lastReadAt")
      GROUP BY m."conversationId"
    `;
    const unreadByConversation = new Map(
      unread.map((row) => [row.conversationId, Number(row.count)]),
    );
    return conversations.map((item) =>
      this.serializeConversation(item, currentUserId, unreadByConversation.get(item.id) ?? 0),
    );
  }

  async messages(currentUserId: string, conversationId: string, page = 1, limit = 30) {
    await this.assertParticipant(currentUserId, conversationId);
    const safeLimit = Math.min(Math.max(limit, 1), 60);
    const safePage = Math.max(page, 1);
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
      include: { sender: { select: { id: true, name: true, username: true } } },
    });
    return messages.reverse().map((message) => this.serializeMessage(message));
  }

  async sendMessage(
    currentUserId: string,
    conversationId: string,
    content: string,
    messageType: 'text' | 'generated_email' = 'text',
    generatedEmailDraftId?: string,
  ) {
    await this.assertParticipant(currentUserId, conversationId);
    const trimmed = content.trim();
    if (!trimmed) throw new BadRequestException('Message content is required');
    if (trimmed.length > 10000) throw new BadRequestException('Message content is too long');

    const message = await this.prisma.$transaction(async (tx) => {
      const created = await tx.message.create({
        data: {
          conversationId,
          senderId: currentUserId,
          content: trimmed,
          messageType,
          generatedEmailDraftId,
        },
        include: { sender: { select: { id: true, name: true, username: true } } },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: created.createdAt },
      });
      return created;
    });
    return this.serializeMessage(message);
  }

  async sendGeneratedEmail(currentUserId: string, conversationId: string, draftId: string) {
    await this.assertParticipant(currentUserId, conversationId);
    const draft = await this.prisma.emailDraft.findFirst({
      where: { id: draftId, userId: currentUserId },
    });
    if (!draft) throw new NotFoundException('Draft not found');
    const content = [`Subject: ${draft.subject}`, '', draft.body].join('\n');
    return this.sendMessage(currentUserId, conversationId, content, 'generated_email', draft.id);
  }

  async deleteMessage(currentUserId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== currentUserId) throw new ForbiddenException('Cannot delete message');
    const deleted = await this.prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
      include: { sender: { select: { id: true, name: true, username: true } } },
    });
    return this.serializeMessage(deleted);
  }

  async markRead(currentUserId: string, conversationId: string) {
    await this.assertParticipant(currentUserId, conversationId);
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId: currentUserId } },
      data: { lastReadAt: new Date() },
    });
    return { success: true };
  }

  async assertParticipant(currentUserId: string, conversationId: string) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId: currentUserId } },
    });
    if (!participant) throw new ForbiddenException('Conversation not available');
    return participant;
  }

  private conversationInclude(currentUserId: string) {
    return {
      participants: {
        include: { user: { select: { id: true, name: true, username: true } } },
      },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' as const },
        take: 1,
      },
    };
  }

  private serializeConversation(conversation: any, currentUserId: string, unreadCount: number) {
    const otherParticipant = conversation.participants.find(
      (item: any) => item.userId !== currentUserId,
    );
    const lastMessage = conversation.messages?.[0] ?? null;
    return {
      id: conversation.id,
      type: conversation.type,
      otherParticipant: otherParticipant?.user
        ? { ...otherParticipant.user, avatarInitials: this.initials(otherParticipant.user.name) }
        : null,
      lastMessage,
      unreadCount,
      lastMessageAt: conversation.lastMessageAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private serializeMessage(message: any) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      sender: message.sender,
      content: message.deletedAt ? '' : message.content,
      messageType: message.messageType,
      generatedEmailDraftId: message.generatedEmailDraftId,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      deletedAt: message.deletedAt,
    };
  }

  private initials(name: string) {
    return name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join();
  }

  private directKey(firstUserId: string, secondUserId: string) {
    return [firstUserId, secondUserId].sort().join(':');
  }
}
