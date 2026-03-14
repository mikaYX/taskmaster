import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes, createHash } from 'crypto';
import { Permission } from './permissions.enum';

@Injectable()
export class ApiKeysService {
  constructor(private prisma: PrismaService) { }

  /**
   * Create a new API Key.
   * Returns the raw key (only time it's visible).
   */
  async createKey(
    name: string,
    description?: string,
    scopes: string[] = [],
    expiresAt?: Date,
  ): Promise<{ apiKey: string; id: number; prefix: string }> {
    // 1. Strict Scope Validation
    const validScopes = Object.values(Permission);
    const invalidScopes = scopes.filter(
      (scope) => !validScopes.includes(scope as Permission),
    );

    if (invalidScopes.length > 0) {
      throw new BadRequestException(
        `Invalid scopes: ${invalidScopes.join(', ')}`,
      );
    }

    // 2. Robust Key Generation (Collision Avoidance)
    const rawKey = 'sk_' + randomBytes(32).toString('hex'); // sk_ + 64 chars
    const keyPrefix = rawKey.substring(0, 8); // "sk_" + 5 chars (8 total) because schema is VarChar(8)

    const hashedKey = this.hashKey(rawKey);

    const apiKey = await (this.prisma.client as any).apiKey.create({
      data: {
        name,
        description,
        keyPrefix,
        hashedKey,
        scopes,
        expiresAt,
      },
    });

    return { apiKey: rawKey, id: apiKey.id, prefix: keyPrefix };
  }

  async validateKey(rawKey: string): Promise<any> {
    // Returns ApiKey entity or null
    const prefix = rawKey.substring(0, 8);

    // Handle potential prefix collisions by checking all matches
    const candidates = await (this.prisma.client as any).apiKey.findMany({
      where: { keyPrefix: prefix },
    });

    if (!candidates.length) return null;

    for (const apiKey of candidates) {
      if (
        apiKey.revokedAt ||
        (apiKey.expiresAt && new Date(apiKey.expiresAt) < new Date())
      ) {
        continue;
      }

      const isValid = this.verifyHash(rawKey, apiKey.hashedKey);
      if (isValid) {
        // Update lastUsedAt (fire and forget)
        await (this.prisma.client as any).apiKey.update({
          where: { id: apiKey.id },
          data: { lastUsedAt: new Date() },
        });
        return apiKey;
      }
    }

    return null; // No valid matching key found
  }

  async revoke(id: number) {
    return (this.prisma.client as any).apiKey.update({
      where: { id },
      data: { revokedAt: new Date() },
    });
  }

  async rotate(
    id: number,
  ): Promise<{ apiKey: string; id: number; prefix: string }> {
    const existing = await (this.prisma.client as any).apiKey.findUnique({
      where: { id },
    });
    if (!existing || existing.revokedAt) {
      throw new BadRequestException('API Key not found or already revoked');
    }

    const newKey = await this.createKey(
      existing.name || `Rotated ${existing.keyPrefix}`,
      existing.description,
      existing.scopes as string[],
      existing.expiresAt,
    );
    await this.revoke(id);
    return newKey;
  }

  async list() {
    return (this.prisma.client as any).apiKey.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        keyPrefix: true,
        scopes: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }

  private hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  private verifyHash(key: string, hash: string): boolean {
    return this.hashKey(key) === hash;
  }
}
