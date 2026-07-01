import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const RESERVED_USERNAMES = new Set(['admin', 'support', 'z', 'system', 'root']);
const USERNAME_PATTERN = /^[a-z0-9_.]{3,24}$/;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async checkUsername(raw: string) {
    const username = this.normalize(raw);
    const available = await this.isAvailable(username);
    return {
      available,
      suggestions: available ? [] : await this.suggestions(username),
    };
  }

  async search(currentUserId: string, q: string) {
    const query = q.trim().toLowerCase();
    if (query.length > 100) throw new BadRequestException('Search query is too long');
    if (query.length < 2) return [];
    const users = await this.prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 20,
      orderBy: [{ username: 'asc' }],
      select: { id: true, name: true, username: true },
    });
    return users.map((user) => ({
      ...user,
      avatarInitials: this.initials(user.name),
    }));
  }

  async checkEmail(currentUserId: string, raw: string) {
    const email = raw.trim().toLowerCase();
    if (!email) throw new BadRequestException('Email is required');
    if (email.length > 320) throw new BadRequestException('Email is too long');
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true },
    });
    if (!user || user.id === currentUserId) return { exists: false };
    return {
      exists: true,
      userId: user.id,
      name: user.name,
      email: user.email,
      avatarInitials: this.initials(user.name),
    };
  }

  private async suggestions(username: string) {
    const base = username.replace(/[^a-z0-9_.]/g, '').slice(0, 18) || 'user';
    const year = new Date().getFullYear();
    const candidates = [
      `${base}${Math.floor(Math.random() * 90) + 10}`,
      `${base}_${Math.floor(Math.random() * 90) + 10}`,
      `${base}.dev`,
      `${base}${year}`,
      `${base}_${Math.floor(Math.random() * 900) + 100}`,
    ];
    const result: string[] = [];
    for (const candidate of candidates) {
      const normalized = candidate.slice(0, 24);
      if (!result.includes(normalized) && (await this.isAvailable(normalized))) {
        result.push(normalized);
      }
      if (result.length >= 4) break;
    }
    return result;
  }

  private async isAvailable(username: string) {
    if (!USERNAME_PATTERN.test(username) || RESERVED_USERNAMES.has(username)) return false;
    const existing = await this.prisma.user.findUnique({ where: { username } });
    return !existing;
  }

  private normalize(value: string) {
    const username = value.trim().toLowerCase();
    if (!username) throw new BadRequestException('Username is required');
    return username;
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
}
