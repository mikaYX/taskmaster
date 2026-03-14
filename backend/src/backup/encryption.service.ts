import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Transform } from 'stream';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';

  constructor(private readonly configService: ConfigService) {}

  /**
   * Get the encryption key.
   * Prioritizes the provided key (manual), falls back to ENV key.
   */
  private getKey(providedKey?: string): Buffer {
    const envKey = this.configService.get<string>('BACKUP_ENCRYPTION_KEY');
    const keyString = providedKey || envKey;

    if (!keyString) {
      throw new Error(
        'No encryption key provided and BACKUP_ENCRYPTION_KEY is not set',
      );
    }

    // Ensure key is 32 bytes. If shorter/longer, hatch it or pad it,
    // but for security standard, let's assume specific format or hash it.
    // Simple strategy: SHA-256 the password to get a 32-byte key.
    return crypto.createHash('sha256').update(keyString).digest();
  }

  /**
   * Create an encryption stream.
   * Prepends IV (16 bytes) to the stream.
   * Appends Auth Tag (16 bytes) at the end.
   */
  createEncryptStream(keyOrPassword?: string): Transform {
    const key = this.getKey(keyOrPassword);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    let ivPushed = false;

    return new Transform({
      transform(chunk, encoding, callback) {
        if (!ivPushed) {
          this.push(iv); // Prepend IV
          ivPushed = true;
        }
        const encrypted = cipher.update(chunk);
        if (encrypted.length > 0) this.push(encrypted);
        callback();
      },
      flush(callback) {
        const final = cipher.final();
        if (final.length > 0) this.push(final);
        const authTag = cipher.getAuthTag();
        this.push(authTag); // Append Auth Tag
        callback();
      },
    });
  }

  /**
   * Create a decryption stream.
   * Extract IV from the first 16 bytes.
   * Validates Auth Tag at the end.
   */
  createDecryptStream(keyOrPassword?: string): Transform {
    const key = this.getKey(keyOrPassword);
    let iv: Buffer | null = null;
    let decipher: crypto.DecipherGCM | null = null;
    let authTag: Buffer | null = null; // We might need to handle auth tag logic differently for stream

    // STREAM DECRYPTION WITH GCM is tricky because AuthTag is at the end.
    // Standard crypto.createDecipheriv requires AuthTag to be set via setAuthTag() BEFORE final().
    // But in a stream we only get it at the end.
    // Node.js 'crypto' streams usually handle this if setup correctly,
    // but often libraries like 'scrypt' or specific stream wrappers are used.
    //
    // SIMPLIFICATION FOR ROBUSTNESS:
    // Since we write IV (start) and AuthTag (end), we need a custom transform
    // that buffers the AuthTag or we construct a format.
    //
    // ALTERNATIVE: Use a simpler stream protocol: [IV 16b][Encrypted Content][AuthTag 16b]
    // The transform needs to hold back the last 16 bytes to be used as AuthTag.

    let buffer = Buffer.alloc(0);
    const algorithm = this.algorithm;

    return new Transform({
      transform(chunk, encoding, callback) {
        buffer = Buffer.concat([buffer, chunk]);

        // We need at least 16 bytes for IV to start
        if (!decipher && buffer.length >= 16) {
          iv = buffer.slice(0, 16);
          buffer = buffer.slice(16);
          decipher = crypto.createDecipheriv(algorithm, key, iv);
        }

        if (decipher) {
          // We must keep at least 16 bytes in buffer for the AuthTag at the end
          // So we only decrypt (buffer.length - 16) bytes
          if (buffer.length > 16) {
            const toDecrypt = buffer.slice(0, buffer.length - 16);
            buffer = buffer.slice(buffer.length - 16); // Keep last 16 bytes

            const decrypted = decipher.update(toDecrypt);
            if (decrypted.length > 0) this.push(decrypted);
          }
        }
        callback();
      },
      flush(callback) {
        if (!decipher) {
          callback(new Error('Stream too short, no IV found'));
          return;
        }
        if (buffer.length !== 16) {
          callback(new Error('Stream ended but AuthTag missing or incomplete'));
          return;
        }

        authTag = buffer;
        decipher.setAuthTag(authTag);

        try {
          const final = decipher.final();
          if (final.length > 0) this.push(final);
          callback();
        } catch (err) {
          callback(new Error('Decryption failed: Invalid Key or Auth Tag'));
        }
      },
    });
  }
}
