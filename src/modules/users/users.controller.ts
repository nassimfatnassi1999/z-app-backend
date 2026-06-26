import { Body, Controller, Get, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';

type AuthRequest = Request & { user: { userId: string; email: string } };

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
  ) {}

  @Get('check-username')
  checkUsername(@Query('username') username = '') {
    return this.users.checkUsername(username);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  me(@Req() req: AuthRequest) {
    return this.auth.me(req.user.userId);
  }

  @Get('search')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  search(@Req() req: AuthRequest, @Query('q') q = '') {
    return this.users.search(req.user.userId, q);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  updateMe(@Req() req: AuthRequest, @Body('name') name: string) {
    return this.auth.updateMe(req.user.userId, name);
  }
}
