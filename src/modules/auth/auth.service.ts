import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResendVerificationCodeDto } from './dto/resend-verification-code.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';

const RESERVED_USERNAMES = new Set(['admin', 'support', 'z', 'system', 'root']);
const USERNAME_PATTERN = /^[a-z0-9_.]{3,24}$/;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase().trim();
    const username = dto.username.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(username) || RESERVED_USERNAMES.has(username)) {
      throw new BadRequestException('Username is not allowed');
    }

    const existingEmail = await this.prisma.user.findUnique({ where: { email } });
    if (existingEmail) throw new ConflictException('Email already registered');
    const existingUsername = await this.prisma.user.findUnique({ where: { username } });
    if (existingUsername) throw new ConflictException('Username already taken');

    const user = await this.prisma.user.create({
      data: {
        email,
        username,
        name: dto.name,
        passwordHash: await bcrypt.hash(dto.password, 12),
        emailVerifiedAt: null,
      },
    });

    await this.createAndSendVerificationCode(user.id, user.email, user.name);
    return {
      requiresEmailVerification: true,
      email: user.email,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Email not verified',
        email: user.email,
      });
    }

    return this.issueTokens(user.id, user.email, user.name, user.username);
  }

  async verifyEmail(dto: VerifyEmailDto) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) throw new BadRequestException('Code incorrect.');

    const code = await this.prisma.emailVerificationCode.findFirst({
      where: { userId: user.id, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!code) throw new BadRequestException('Code incorrect.');

    const maxAttempts = this.maxAttempts();
    if (code.attempts >= maxAttempts) {
      throw new HttpException(
        'Trop de tentatives. Renvoyez un nouveau code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (code.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Code expiré. Demandez un nouveau code.');
    }

    const codeHash = this.hashVerificationCode(dto.code);
    if (!this.secureHashEquals(codeHash, code.codeHash)) {
      await this.prisma.emailVerificationCode.update({
        where: { id: code.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Code incorrect.');
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationCode.update({
        where: { id: code.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);

    return this.issueTokens(user.id, user.email, user.name, user.username);
  }

  async resendVerificationCode(dto: ResendVerificationCodeDto) {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.emailVerifiedAt) return { success: true };
    await this.createAndSendVerificationCode(user.id, user.email, user.name, {
      respectCooldown: true,
    });
    return { success: true };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string }>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user?.refreshTokenHash || !(await bcrypt.compare(refreshToken, user.refreshTokenHash))) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      return this.issueTokens(user.id, user.email, user.name, user.username);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    return { success: true };
  }

  async me(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
  }

  async updateMe(userId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('Name is required');
    return this.prisma.user.update({
      where: { id: userId },
      data: { name: trimmed },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        emailVerifiedAt: true,
        createdAt: true,
      },
    });
  }

  private async createAndSendVerificationCode(
    userId: string,
    email: string,
    name?: string,
    options: { respectCooldown?: boolean } = {},
  ) {
    const cooldownSeconds = this.resendCooldownSeconds();
    const latest = await this.prisma.emailVerificationCode.findFirst({
      where: { userId, usedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    if (options.respectCooldown && latest) {
      const elapsedSeconds = (Date.now() - latest.createdAt.getTime()) / 1000;
      if (elapsedSeconds < cooldownSeconds) {
        throw new HttpException(
          `Renvoyer dans ${Math.ceil(cooldownSeconds - elapsedSeconds)}s`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    await this.prisma.emailVerificationCode.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const code = randomInt(100000, 1000000).toString();
    const ttlMinutes = this.codeTtlMinutes();
    await this.prisma.emailVerificationCode.create({
      data: {
        userId,
        codeHash: this.hashVerificationCode(code),
        expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000),
      },
    });

    await this.mail.sendVerificationEmail({
      to: email,
      name,
      code,
      expiresInMinutes: ttlMinutes,
    });
  }

  private hashVerificationCode(code: string) {
    const secret = this.config.getOrThrow<string>('EMAIL_CODE_SECRET');
    return createHmac('sha256', secret).update(code).digest('hex');
  }

  private secureHashEquals(actual: string, expected: string) {
    const actualBuffer = Buffer.from(actual, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    return (
      actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private codeTtlMinutes() {
    return Number(this.config.get<string>('EMAIL_VERIFICATION_CODE_TTL_MINUTES') || 5);
  }

  private resendCooldownSeconds() {
    return Number(this.config.get<string>('EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS') || 60);
  }

  private maxAttempts() {
    return Number(this.config.get<string>('EMAIL_VERIFICATION_MAX_ATTEMPTS') || 5);
  }

  private async issueTokens(userId: string, email: string, name: string, username: string) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: '30d',
      },
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: await bcrypt.hash(refreshToken, 12) },
    });

    return {
      user: { id: userId, email, name, username },
      accessToken,
      refreshToken,
    };
  }
}
