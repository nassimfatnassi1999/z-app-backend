import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDraftDto } from './dto/create-draft.dto';

type DraftOwner = { userId?: string; deviceId?: string };
type DraftStatus = 'draft' | 'scheduled' | 'sent_internal' | 'deleted';

@Injectable()
export class DraftsService {
  constructor(private readonly prisma: PrismaService) {}

  create(owner: DraftOwner, dto: CreateDraftDto) {
    return this.prisma.emailDraft.create({
      data: { ...dto, ...owner },
    });
  }

  list(owner: DraftOwner) {
    return this.prisma.emailDraft.findMany({
      where: this.ownerWhere(owner),
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(owner: DraftOwner, id: string, status: DraftStatus) {
    const draft = await this.prisma.emailDraft.findFirst({
      where: { id, ...this.ownerWhere(owner) },
    });

    if (!draft) {
      throw new NotFoundException('Draft not found');
    }

    return this.prisma.emailDraft.update({
      where: { id },
      data: { status },
    });
  }

  async claimDeviceDrafts(userId: string, deviceId: string) {
    const normalizedDeviceId = deviceId?.trim();
    if (!normalizedDeviceId) return { count: 0 };
    return this.prisma.emailDraft.updateMany({
      where: {
        userId: null,
        deviceId: normalizedDeviceId,
      },
      data: {
        userId,
        deviceId: null,
      },
    });
  }

  async duplicate(owner: DraftOwner, id: string) {
    const draft = await this.prisma.emailDraft.findFirst({
      where: { id, ...this.ownerWhere(owner) },
    });
    if (!draft) {
      throw new NotFoundException('Draft not found');
    }
    return this.prisma.emailDraft.create({
      data: {
        userId: draft.userId,
        deviceId: draft.deviceId,
        recipient: draft.recipient,
        subject: draft.subject,
        body: draft.body,
        tone: draft.tone,
        transcript: draft.transcript,
        templateKey: draft.templateKey,
        status: 'draft',
      },
    });
  }

  private ownerWhere(owner: DraftOwner) {
    return owner.userId ? { userId: owner.userId } : { deviceId: owner.deviceId };
  }
}
