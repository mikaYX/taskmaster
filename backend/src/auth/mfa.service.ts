import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { TOTP, NobleCryptoPlugin, ScureBase32Plugin } from 'otplib';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma';
import { EncryptionService } from '../settings/encryption.service';

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);
  private readonly totp: TOTP;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {
    this.totp = new TOTP({
      crypto: new NobleCryptoPlugin(),
      base32: new ScureBase32Plugin(),
    });
  }

  /**
   * Generates a new TOTP secret for the user and returns the provisioning URI and the raw secret
   * (for manual entry if QR code is not working).
   * Note: This does NOT enable MFA yet.
   */
  async generateMfaSecret(
    userId: number,
    email: string,
  ): Promise<{ secret: string; uri: string; qrCodeUrl: string }> {
    try {
      const user = await this.prisma.client.user.findUnique({
        where: { id: userId },
      });
      if (!user) throw new BadRequestException('User not found');

      if (user.mfaEnabled) {
        throw new BadRequestException('MFA is already enabled');
      }

      const secret = this.totp.generateSecret();
      const uri = this.totp.toURI({
        label: email,
        issuer: 'Taskmaster',
        secret,
      });

      // Store the encrypted secret provisionally (fits in VARCHAR(255): iv:tag:cipher ~90 chars)
      const encryptedSecret = this.encryption.encrypt(secret);
      await this.prisma.client.user.update({
        where: { id: userId },
        data: { mfaSecretEncrypted: encryptedSecret, mfaEnabled: false },
      });

      const qrCodeUrl = await QRCode.toDataURL(uri);

      return { secret, uri, qrCodeUrl };
    } catch (err) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error(
        `generateMfaSecret failed for user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Unable to generate MFA secret. Please try again or contact support.',
      );
    }
  }

  /**
   * Validates the TOTP token and enables MFA if successful.
   * Generates and returns backup codes.
   */
  async enableMfa(userId: number, token: string): Promise<string[]> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.mfaSecretEncrypted) {
      throw new BadRequestException('MFA configuration not started');
    }

    if (user.mfaEnabled) {
      throw new BadRequestException('MFA is already enabled');
    }

    const secret = this.encryption.decrypt(user.mfaSecretEncrypted);
    const result = await this.totp.verify(token, { secret });
    const isValid = typeof result === 'object' ? result.valid : result;

    if (!isValid) {
      throw new BadRequestException('Invalid verification code');
    }

    const recoveryCodes = this.generateRecoveryCodes();
    const hashedCodes = await Promise.all(
      recoveryCodes.map((code) => bcrypt.hash(code, 10)),
    );

    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaRecoveryCodesHash: JSON.stringify(hashedCodes),
      },
    });

    this.logger.log(`MFA enabled for user ID: ${userId}`);

    return recoveryCodes;
  }

  /**
   * Verifies an MFA token during the login process.
   */
  async verifyMfa(userId: number, token: string): Promise<boolean> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });
    if (!user || !user.mfaEnabled || !user.mfaSecretEncrypted) {
      return false;
    }

    const secret = this.encryption.decrypt(user.mfaSecretEncrypted);

    // Check TOTP first
    const totpResult = await this.totp.verify(token, { secret });
    const totpValid =
      typeof totpResult === 'object' ? totpResult.valid : totpResult;
    if (totpValid) {
      return true;
    }

    // Check recovery codes
    if (user.mfaRecoveryCodesHash) {
      const hashedCodes: string[] = JSON.parse(user.mfaRecoveryCodesHash);
      for (let i = 0; i < hashedCodes.length; i++) {
        const isMatch = await bcrypt.compare(token, hashedCodes[i]);
        if (isMatch) {
          // Consume the recovery code by removing it
          hashedCodes.splice(i, 1);
          await this.prisma.client.user.update({
            where: { id: userId },
            data: { mfaRecoveryCodesHash: JSON.stringify(hashedCodes) },
          });
          this.logger.log(`Recovery code consumed for user ID: ${userId}`);
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Disables MFA for the user.
   */
  async disableMfa(userId: number): Promise<void> {
    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecretEncrypted: null,
        mfaRecoveryCodesHash: null,
      },
    });
    this.logger.log(`MFA disabled for user ID: ${userId}`);
  }

  /**
   * Generates 5 random 12-character recovery codes (e.g., ABC123-DEF456)
   */
  private generateRecoveryCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 5; i++) {
      const part1 = crypto.randomBytes(3).toString('hex').toUpperCase();
      const part2 = crypto.randomBytes(3).toString('hex').toUpperCase();
      codes.push(`${part1}-${part2}`);
    }
    return codes;
  }
}
