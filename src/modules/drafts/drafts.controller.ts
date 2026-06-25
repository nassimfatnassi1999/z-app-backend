import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateDraftStatusDto } from './dto/update-draft-status.dto';
import { DraftsService } from './drafts.service';

type AuthRequest = Request & { user: { userId: string; email: string } };

@ApiTags('drafts')
@Controller('drafts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DraftsController {
  constructor(private readonly drafts: DraftsService) {}

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateDraftDto) {
    return this.drafts.create(req.user.userId, dto);
  }

  @Get()
  list(@Req() req: AuthRequest) {
    return this.drafts.list(req.user.userId);
  }

  @Patch(':id/status')
  updateStatus(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateDraftStatusDto,
  ) {
    return this.drafts.updateStatus(req.user.userId, id, dto.status);
  }
}
