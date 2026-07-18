import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MailboxEvents } from './mailbox.events';
import { MailboxService } from './mailbox.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('MailboxService email lifecycle', () => {
  const events = { emitToUser: jest.fn() } as unknown as MailboxEvents;
  const notifications = {
    sendNewEmail: jest.fn(),
  } as unknown as NotificationsService;

  beforeEach(() => jest.clearAllMocks());

  it('deletes owned sent emails and drafts in one transaction', async () => {
    const email = {
      findMany: jest.fn().mockResolvedValue([{ id: 'email-1', senderId: 'user-1' }]),
      update: jest.fn().mockReturnValue(Promise.resolve({ id: 'email-1' })),
    };
    const emailDraft = {
      findMany: jest.fn().mockResolvedValue([{ id: 'draft-1' }]),
      updateMany: jest.fn().mockReturnValue(Promise.resolve({ count: 1 })),
    };
    const transaction = jest.fn().mockResolvedValue([]);
    const service = new MailboxService(
      { email, emailDraft, $transaction: transaction } as unknown as PrismaService,
      events,
      notifications,
    );

    await expect(service.deleteBatch('user-1', ['email-1', 'draft-1'])).resolves.toEqual({
      deleted: 2,
      emailIds: ['email-1', 'draft-1'],
    });
    expect(email.update).toHaveBeenCalledWith({
      where: { id: 'email-1' },
      data: { senderDeleted: true },
    });
    expect(emailDraft.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['draft-1'] }, userId: 'user-1' },
      data: { status: 'TRASHED' },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('rejects the whole batch when one id is not owned', async () => {
    const email = { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() };
    const emailDraft = { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() };
    const transaction = jest.fn();
    const service = new MailboxService(
      { email, emailDraft, $transaction: transaction } as unknown as PrismaService,
      events,
      notifications,
    );

    await expect(service.deleteBatch('user-1', ['foreign-email'])).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(email.update).not.toHaveBeenCalled();
    expect(emailDraft.updateMany).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });

  it('does not mark a draft sent when creating the sent email fails', async () => {
    const draftUpdate = jest.fn();
    const tx = {
      emailDraft: {
        findFirst: jest.fn().mockResolvedValue({ id: 'draft-1', transcript: 'voice' }),
        update: draftUpdate,
      },
      email: { create: jest.fn().mockRejectedValue(new Error('database unavailable')) },
    };
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'user-2' }) },
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
    };
    const service = new MailboxService(prisma as unknown as PrismaService, events, notifications);

    await expect(
      service.send('user-1', {
        recipientId: 'user-2',
        subject: 'Subject',
        body: 'Body',
        draftId: 'draft-1',
      }),
    ).rejects.toThrow('database unavailable');
    expect(draftUpdate).not.toHaveBeenCalled();
    expect(events.emitToUser).not.toHaveBeenCalled();
    expect(notifications.sendNewEmail).not.toHaveBeenCalled();
  });
});
