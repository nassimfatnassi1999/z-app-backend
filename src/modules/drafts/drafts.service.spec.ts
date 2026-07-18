import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DraftsService } from './drafts.service';

describe('DraftsService', () => {
  const dto = {
    recipient: 'new@example.com',
    subject: 'Updated subject',
    body: 'Updated body',
    tone: 'professional',
    transcript: '',
    templateKey: 'other',
  };

  it('updates the same owned draft without creating another one', async () => {
    const emailDraft = {
      findFirst: jest.fn().mockResolvedValue({ id: 'draft-1' }),
      update: jest.fn().mockResolvedValue({ id: 'draft-1', ...dto }),
      create: jest.fn(),
    };
    const service = new DraftsService({ emailDraft } as unknown as PrismaService);

    const result = await service.update({ userId: 'user-1' }, 'draft-1', dto);

    expect(emailDraft.findFirst).toHaveBeenCalledWith({
      where: { id: 'draft-1', userId: 'user-1', status: 'DRAFT' },
    });
    expect(emailDraft.update).toHaveBeenCalledWith({
      where: { id: 'draft-1' },
      data: dto,
    });
    expect(emailDraft.create).not.toHaveBeenCalled();
    expect(result.id).toBe('draft-1');
  });

  it('does not update a draft owned by someone else', async () => {
    const emailDraft = {
      findFirst: jest.fn().mockResolvedValue(null),
      update: jest.fn(),
    };
    const service = new DraftsService({ emailDraft } as unknown as PrismaService);

    await expect(service.update({ userId: 'user-1' }, 'draft-1', dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(emailDraft.update).not.toHaveBeenCalled();
  });
});
