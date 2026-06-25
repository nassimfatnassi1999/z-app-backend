import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDraftDto } from './dto/create-draft.dto';

@Injectable()
export class DraftsService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, dto: CreateDraftDto) {
    return this.prisma.emailDraft.create({
      data: { ...dto, userId },
    });
  }

  list(userId: string) {
    return this.prisma.emailDraft.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(userId: string, id: string, status: 'draft' | 'opened_in_mail_app') {
    const draft = await this.prisma.emailDraft.findFirst({
      where: { id, userId },
    });

    if (!draft) {
      throw new NotFoundException('Draft not found');
    }

    return this.prisma.emailDraft.update({
      where: { id },
      data: { status },
    });
  }
}
