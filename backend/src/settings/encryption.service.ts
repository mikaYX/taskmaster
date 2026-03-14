import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Encryption Service for sensitive settings.
 *
 * Uses AES-256-GCM for authenticated encryption.
 * Key derived from AUTH_SECRET.
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    // Derive key from AUTH_SECRET using SHA-256
    const secret = this.configService.get<string>('AUTH_SECRET');
    if (!secret || typeof secret !== 'string' || secret.length < 16) {
      throw new Error(
        'AUTH_SECRET must be set and at least 16 characters (required for encryption of MFA secrets and sensitive settings)',
      );
    }
    this.key = crypto.createHash('sha256').update(secret, 'utf8').digest();
  }

  /**
   * Encrypts a plaintext value.
   * Returns: iv:authTag:ciphertext (all base64)
   */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
  }

  /**
   * Decrypts an encrypted value.
   */
  decrypt(encryptedValue: string): string {
    try {
      const [ivB64, authTagB64, ciphertext] = encryptedValue.split(':');

      if (!ivB64 || !authTagB64 || !ciphertext) {
        throw new Error('Invalid encrypted format');
      }

      const iv = Buffer.from(ivB64, 'base64');
      const authTag = Buffer.from(authTagB64, 'base64');

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      this.logger.error('Decryption failed', error);
      throw new Error('Failed to decrypt value');
    }
  }

  /**
   * Check if a value appears to be encrypted.
   */
  isEncrypted(value: string): boolean {
    const parts = value.split(':');
    return parts.length === 3;
  }
}
