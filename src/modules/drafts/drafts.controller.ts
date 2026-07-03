import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CreateDraftDto } from './dto/create-draft.dto';
import { UpdateDraftStatusDto } from './dto/update-draft-status.dto';
import { DraftsService } from './drafts.service';

type AuthRequest = Request & { user?: { userId: string; email: string } | null };
type DraftOwner = { userId?: string; deviceId?: string };

@ApiTags('drafts')
@Controller('drafts')
@UseGuards(OptionalJwtAuthGuard)
@ApiBearerAuth()
export class DraftsController {
  constructor(private readonly drafts: DraftsService) {}

  @Post()
  create(
    @Req() req: AuthRequest,
    @Headers('x-device-id') deviceId: string | undefined,
    @Body() dto: CreateDraftDto,
  ) {
    return this.drafts.create(this.ownerFrom(req, deviceId), dto);
  }

  @Post('claim-device-drafts')
  claimDeviceDrafts(@Req() req: AuthRequest, @Body('deviceId') deviceId: string) {
    if (!req.user?.userId) {
      throw new BadRequestException('Authentication is required');
    }
    return this.drafts.claimDeviceDrafts(req.user.userId, deviceId);
  }

  @Get()
  list(@Req() req: AuthRequest, @Headers('x-device-id') deviceId: string | undefined) {
    return this.drafts.list(this.ownerFrom(req, deviceId));
  }

  @Patch(':id/status')
  updateStatus(
    @Req() req: AuthRequest,
    @Headers('x-device-id') deviceId: string | undefined,
    @Param('id') id: string,
    @Body() dto: UpdateDraftStatusDto,
  ) {
    return this.drafts.updateStatus(this.ownerFrom(req, deviceId), id, dto.status);
  }

  @Patch(':id')
  update(
    @Req() req: AuthRequest,
    @Headers('x-device-id') deviceId: string | undefined,
    @Param('id') id: string,
    @Body() dto: CreateDraftDto,
  ) {
    return this.drafts.update(this.ownerFrom(req, deviceId), id, dto);
  }

  @Post(':id/duplicate')
  duplicate(
    @Req() req: AuthRequest,
    @Headers('x-device-id') deviceId: string | undefined,
    @Param('id') id: string,
  ) {
    return this.drafts.duplicate(this.ownerFrom(req, deviceId), id);
  }

  @Delete(':id')
  delete(
    @Req() req: AuthRequest,
    @Headers('x-device-id') deviceId: string | undefined,
    @Param('id') id: string,
  ) {
    return this.drafts.updateStatus(this.ownerFrom(req, deviceId), id, 'deleted');
  }

  private ownerFrom(req: AuthRequest, rawDeviceId?: string): DraftOwner {
    if (req.user?.userId) return { userId: req.user.userId };
    const deviceId = rawDeviceId?.trim();
    if (!deviceId) {
      throw new BadRequestException('X-Device-Id is required for anonymous drafts');
    }
    return { deviceId };
  }
}
