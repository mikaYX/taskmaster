import {
  Injectable,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import Redis from 'ioredis';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { User, Passkey } from '@prisma/client';
import { Request } from 'express';
import { randomBytes } from 'crypto';

@Injectable()
export class PasskeysService {
  private readonly logger = new Logger(PasskeysService.name);
  private readonly rpName = 'Taskmaster';
  private readonly rpID = process.env.RP_ID || 'localhost';
  private readonly expectedOrigin = process.env.FRONTEND_URL || [
    'http://localhost:5173',
    'http://localhost:3000',
  ];

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Generates options for the frontend to create a new Passkey
   */
  async generateRegistrationOptions(user: User) {
    const userPasskeys = await this.prisma.client.passkey.findMany({
      where: { userId: user.id },
    });

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: Buffer.from(user.id.toString(), 'utf8'),
      userName: user.username,
      attestationType: 'none',
      excludeCredentials: userPasskeys.map((passkey) => ({
        id: passkey.id,
        type: 'public-key',
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    await this.redis.set(
      `passkey:challenge:reg:${user.id}`,
      options.challenge,
      'EX',
      300,
    );
    return options;
  }

  /**
   * Verifies the Passkey registration response from the frontend
   */
  async verifyRegistration(
    user: User,
    body: any,
    name: string | undefined,
    req: Request,
  ) {
    const expectedChallenge = await this.redis.get(
      `passkey:challenge:reg:${user.id}`,
    );
    if (!expectedChallenge) {
      throw new BadRequestException('Registration session expired or invalid');
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: this.getExpectedOrigin(),
        expectedRPID: this.rpID,
      });
    } catch (error: any) {
      this.logger.error('Passkey verification failed', error);
      throw new BadRequestException(error.message);
    }

    if (verification.verified && verification.registrationInfo) {
      const { credential, credentialDeviceType, credentialBackedUp } =
        verification.registrationInfo;

      await this.prisma.client.passkey.create({
        data: {
          id: credential.id, // Base64URL string
          publicKey: Buffer.from(credential.publicKey),
          userId: user.id,
          name: name || null,
          counter: BigInt(credential.counter),
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
          transports: credential.transports
            ? credential.transports.join(',')
            : null,
        },
      });

      await this.redis.del(`passkey:challenge:reg:${user.id}`);
      await this.redis.del(`session:${user.id}`);
      return { verified: true };
    }

    throw new BadRequestException('Passkey verification failed');
  }

  /**
   * Generates options to login with a Passkey
   */
  async generateAuthenticationOptions() {
    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: 'preferred',
    });

    // Generate a temporary session ID for this anonymous login attempt
    const tempSessionId = Buffer.from(
      crypto.getRandomValues(new Uint8Array(16)),
    ).toString('hex');
    await this.redis.set(
      `passkey:challenge:auth:${tempSessionId}`,
      options.challenge,
      'EX',
      300,
    );

    return { options, sessionId: tempSessionId };
  }

  /**
   * Verifies the login response and returns the authenticated user
   */
  async verifyAuthentication(
    body: any,
    sessionId: string,
    req: Request,
  ): Promise<User> {
    const expectedChallenge = await this.redis.get(
      `passkey:challenge:auth:${sessionId}`,
    );
    if (!expectedChallenge) {
      throw new BadRequestException(
        'Authentication session expired or invalid',
      );
    }

    const passkeyId = body.id;
    const passkey = await this.prisma.client.passkey.findUnique({
      where: { id: passkeyId },
      include: { user: true },
    });

    if (!passkey) {
      throw new BadRequestException('Passkey not found');
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge,
        expectedOrigin: this.getExpectedOrigin(),
        expectedRPID: this.rpID,
        credential: {
          id: passkey.id,
          publicKey: passkey.publicKey,
          counter: Number(passkey.counter),
          transports: passkey.transports
            ? (passkey.transports.split(',') as any)
            : undefined,
        },
      });
    } catch (error: any) {
      this.logger.error('Passkey authentication failed', error);
      throw new BadRequestException(error.message);
    }

    if (verification.verified && verification.authenticationInfo) {
      const { newCounter } = verification.authenticationInfo;
      // Update counter to prevent replay
      await this.prisma.client.passkey.update({
        where: { id: passkey.id },
        data: {
          counter: BigInt(newCounter),
          lastUsedAt: new Date(),
        },
      });

      await this.redis.del(`passkey:challenge:auth:${sessionId}`);
      return passkey.user;
    }

    throw new BadRequestException('Passkey authentication failed');
  }

  async listPasskeys(userId: number) {
    const passkeys = await this.prisma.client.passkey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        deviceType: true,
        backedUp: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return passkeys;
  }

  async deletePasskey(userId: number, id: string) {
    const obj = await this.prisma.client.passkey.findUnique({
      where: { id, userId },
    });
    if (!obj) {
      throw new BadRequestException('Passkey not found');
    }
    await this.prisma.client.passkey.delete({ where: { id } });
    await this.redis.del(`session:${userId}`);
    return { success: true };
  }

  private getExpectedOrigin(): string[] {
    if (Array.isArray(this.expectedOrigin)) return this.expectedOrigin;
    return [this.expectedOrigin];
  }
}
