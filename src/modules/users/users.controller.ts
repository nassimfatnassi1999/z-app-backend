import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

type AuthRequest = Request & { user: { userId: string; email: string } };

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly auth: AuthService) {}

  @Get('me')
  me(@Req() req: AuthRequest) {
    return this.auth.me(req.user.userId);
  }

  @Patch('me')
  updateMe(@Req() req: AuthRequest, @Body('name') name: string) {
    return this.auth.updateMe(req.user.userId, name);
  }
}
