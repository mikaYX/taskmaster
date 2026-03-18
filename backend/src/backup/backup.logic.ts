import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join, resolve as pathResolve } from 'path';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  createWriteStream,
  createReadStream,
  rmSync,
  readFileSync,
  appendFileSync,
  openSync,
  readSync,
  closeSync,
  cpSync,
  copyFileSync,
  renameSync,
} from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as archiver from 'archiver';
import * as crypto from 'crypto';
import { SettingsService } from '../settings';
import { EncryptionService } from './encryption.service';

const execAsync = promisify(exec);
const DEFAULT_BACKUP_DIR = join(process.cwd(), 'backups', 'system');
const TEMP_UPLOADS_DIR = join(process.cwd(), 'backups', 'temp_uploads');

export type BackupSourceType = 'backup_name' | 'temp_upload_path';

@Injectable()
export class BackupLogicService {
  private readonly logger = new Logger(BackupLogicService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly settings: SettingsService,
    private readonly encryptionService: EncryptionService,
  ) { }

  /**
   * Check if the current encryption key is the default one from .env.example
   */
  isEncryptionKeyDefault(): boolean {
    const key = this.configService.get<string>('BACKUP_ENCRYPTION_KEY');
    const defaultKeys = [
      'change-me-to-a-random-hex-string',
      'your-secure-encryption-key-min-32-chars',
    ];
    // We trim to handle potential accidental whitespace
    const trimmedKey = key?.trim();
    return !!trimmedKey && defaultKeys.includes(trimmedKey);
  }

  /**
   * Check if an encryption key is configured.
   */
  isEncryptionKeyPresent(): boolean {
    const key = this.configService.get<string>('BACKUP_ENCRYPTION_KEY');
    return !!key && key.trim().length > 0;
  }

  /**
   * Get the effective storage path (from settings or env).
   */
  private async getStoragePath(): Promise<string> {
    const settingPath = await this.settings.getRawValue<string>('backup.path');
    const configPath = this.configService.get<string>('BACKUP_STORAGE_PATH');

    const rawPath = settingPath || configPath || DEFAULT_BACKUP_DIR;

    // Resolve relative path to absolute based on current process cwd
    const absolutePath = pathResolve(process.cwd(), rawPath);

    if (!existsSync(absolutePath)) {
      this.logger.log(`Creating backup storage directory: ${absolutePath}`);
      mkdirSync(absolutePath, { recursive: true });
    }

    return absolutePath;
  }

  /**
   * Create a System Snapshot (Disaster Recovery).
   */
  async createSystemSnapshot(type: 'DB' | 'FULL' = 'FULL'): Promise<{
    filename: string;
    size: number;
    path: string;
  }> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const id = Math.random().toString(36).substring(2, 6);
    const backupName = `backup_${timestamp}_${id}_${type}`;

    const backupDir = await this.getStoragePath();

    // Temp directory for assembling the archive
    const tempDir = join(backupDir, `temp_${backupName}`);

    // Final encrypted file path
    const finalFilename = `${backupName}.tar.gz.enc`;
    const finalPath = join(backupDir, finalFilename);

    try {
      mkdirSync(tempDir, { recursive: true });

      // 1. Dump Database
      await this.dumpDatabase(tempDir);

      // 2. Add Metadata Manifest
      const manifest = {
        version: '2.0',
        type,
        timestamp: new Date(),
        appVersion: process.env.npm_package_version || 'unknown',
        checksum: 'pending', // Calculated during streaming
      };
      const { writeFileSync } = await import('fs');
      writeFileSync(
        join(tempDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
      );

      // 3. Collect Artifacts (if FULL)
      if (type === 'FULL') {
        this.collectSystemArtifacts(tempDir);
      }

      // 4. Create Archive & Encrypt Stream
      await this.archiveAndEncrypt(tempDir, finalPath);

      // 4.5 Sign Archive with HMAC SHA256
      const hmacKey = this.configService.get<string>('BACKUP_ENCRYPTION_KEY');
      if (!hmacKey) throw new InternalServerErrorException('Missing BACKUP_ENCRYPTION_KEY');
      const signature = await this.signFile(finalPath, hmacKey);
      appendFileSync(finalPath, Buffer.from(signature + '##HMAC##', 'utf8'));

      // 5. Cleanup Temp
      rmSync(tempDir, { recursive: true, force: true });

      const stats = statSync(finalPath);
      this.logger.log(
        `Backup created successfully: ${finalFilename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
      );

      // 6. Retention Cleanup
      await this.cleanupExpired();

      return {
        filename: finalFilename,
        size: stats.size,
        path: finalPath,
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Backup creation failed');
        this.logger.error(`CWD: ${process.cwd()}`);
        this.logger.error(`PATH: ${process.env.PATH}`);
        this.logger.error(
          `Key exists: ${!!this.configService.get('BACKUP_ENCRYPTION_KEY')}`,
        );
        this.logger.error(`Error name: ${error.name}`);
        this.logger.error(`Error message: ${error.message}`);
        this.logger.error(`Error stack: ${error.stack}`);
      } else {
        this.logger.error('Backup creation failed with an unknown error');
      }

      // Cleanup artifacts on failure
      if (existsSync(tempDir))
        rmSync(tempDir, { recursive: true, force: true });
      if (existsSync(finalPath)) unlinkSync(finalPath);
      throw new InternalServerErrorException(
        'Backup creation failed: ' +
        (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  private async dumpDatabase(targetDir: string): Promise<void> {
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    if (!databaseUrl)
      throw new BadRequestException('DATABASE_URL not configured');

    const dumpPath = join(targetDir, 'db.dump');
    let env: NodeJS.ProcessEnv = { ...process.env };
    let command = '';

    try {
      const url = new URL(databaseUrl);
      env = {
        ...process.env,
        PGPASSWORD: url.password,
        PGUSER: url.username,
        PGHOST: url.hostname,
        PGPORT: url.port,
        PGDATABASE: url.pathname.substring(1),
      };
      command = `pg_dump --format=c --file="${dumpPath}"`;
    } catch {
      this.logger.warn(
        'Could not parse DATABASE_URL, falling back to full connection string in command',
      );
      command = `pg_dump "${databaseUrl}" --format=c --file="${dumpPath}"`;
    }

    try {
      this.logger.log(`Executing: ${command.replace(/\/\/.*@/, '//****@')}`);
      await execAsync(command, {
        timeout: 300000,
        env,
      });
    } catch (e: unknown) {
      const execError = e as { message?: string; stderr?: string };
      const fullError = (execError.message || '') + (execError.stderr || '');

      this.logger.warn(`Primary pg_dump failed. Error preview: ${fullError.substring(0, 150)}...`);

      if (
        fullError.includes('server version mismatch') ||
        fullError.includes('not recognized') ||
        fullError.includes('pas reconnu') ||
        fullError.includes('ENOENT') ||
        fullError.includes('command not found')
      ) {
        this.logger.warn(
          'Attempting fallback using Docker container...',
        );

        try {
          const containerName =
            this.configService.get<string>('BACKUP_DOCKER_CONTAINER') ||
            'taskmaster_db';
          const passwordEnv = env.PGPASSWORD
            ? `-e PGPASSWORD="${env.PGPASSWORD}"`
            : '';
          const dockerCmd = `docker exec ${passwordEnv} ${containerName} pg_dump -U ${env.PGUSER || 'taskmaster'} --format=c ${env.PGDATABASE || 'taskmaster'} > "${dumpPath}"`;

          this.logger.log(`Executing Docker fallback on container: ${containerName}`);
          await execAsync(dockerCmd, { timeout: 300000 });
          this.logger.log(`Fallback to Docker pg_dump succeeded`);
          return;
        } catch (dockerError: any) {
          const msg = dockerError.stderr || dockerError.message || '';
          this.logger.error(`Docker fallback failed: ${msg}`);
          throw new Error(`Database dump failed (pg_dump mismatch + Docker fallback failed: ${msg})`);
        }
      }

      this.logger.error('pg_dump failed with unhandled error', e);
      throw e;
    }
  }

  private collectSystemArtifacts(targetDir: string): void {
    // Current CWD is backend/. Uploads are in public/uploads/
    const uploadsSrc = join(process.cwd(), 'public', 'uploads');

    this.logger.log(`Collecting artifacts from: ${uploadsSrc}`);

    if (existsSync(uploadsSrc)) {
      try {
        mkdirSync(join(targetDir, 'uploads'), { recursive: true });
        cpSync(uploadsSrc, join(targetDir, 'uploads'), { recursive: true });
        this.logger.log('Uploads collected successfully');
      } catch (err) {
        this.logger.error('Failed to copy uploads', err);
        // We don't throw here to allow backup to continue even if some files fail
      }
    }

    const envPath = join(process.cwd(), '.env');
    if (!existsSync(envPath)) {
      // Try project root if backend/.env doesn't exist
      const rootEnv = join(process.cwd(), '..', '.env');
      if (existsSync(rootEnv)) {
        copyFileSync(rootEnv, join(targetDir, '.env'));
        this.logger.log('Found .env in project root');
      }
    } else {
      copyFileSync(envPath, join(targetDir, '.env'));
      this.logger.log('Found .env in backend directory');
    }
  }

  private async archiveAndEncrypt(
    sourceDir: string,
    destPath: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(destPath);
      const encrypt = this.encryptionService.createEncryptStream(); // Default: Use ENV key

      const archive = archiver.default('tar', {
        gzip: true,
        gzipOptions: { level: 9 },
      });

      output.on('finish', resolve);
      output.on('error', reject);
      encrypt.on('error', reject);
      archive.on('error', reject);

      archive.pipe(encrypt).pipe(output);
      archive.directory(sourceDir, false);
      void archive.finalize();
    });
  }

  async listBackups() {
    const backupDir = await this.getStoragePath();

    if (!existsSync(backupDir)) {
      this.logger.warn(`Backup directory does not exist: ${backupDir}`);
      return [];
    }

    const files = readdirSync(backupDir);
    const filteredFiles = files.filter((f) => f.endsWith('.enc'));

    if (files.length > 0 && filteredFiles.length === 0) {
      this.logger.warn(
        `Directory ${backupDir} contains ${files.length} files but none match *.enc filter. First file: ${files[0]}`,
      );
    }

    return filteredFiles
      .map((f) => {
        const stats = statSync(join(backupDir, f));
        return {
          filename: f,
          size: stats.size,
          createdAt: stats.mtime,
          type: f.includes('_FULL') ? 'FULL' : 'DB',
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async cleanupExpired(): Promise<number> {
    const count =
      (await this.settings.getRawValue<number>('backup.retention.count')) || 10;
    const backups = await this.listBackups();
    const backupDir = await this.getStoragePath();
    let deleted = 0;

    if (backups.length > count) {
      const toDelete = backups.slice(count);
      toDelete.forEach((b) => {
        try {
          unlinkSync(join(backupDir, b.filename));
          this.logger.log(`Retention cleanup: deleted ${b.filename}`);
          deleted++;
        } catch (e) {
          this.logger.error(`Failed to delete backup ${b.filename}`, e);
        }
      });
    }

    return deleted;
  }

  async getBackupPath(filename: string) {
    if (
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\')
    ) {
      throw new BadRequestException('Invalid filename');
    }
    const backupDir = await this.getStoragePath();
    const path = join(backupDir, filename);
    if (!existsSync(path)) throw new BadRequestException('File not found');
    return path;
  }

  private getTempUploadPath(filename: string): string {
    if (
      !filename ||
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\')
    ) {
      throw new BadRequestException('Invalid temp filename');
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(filename)) {
      throw new BadRequestException('Invalid temp filename');
    }

    const tempPath = join(TEMP_UPLOADS_DIR, filename);
    if (!existsSync(tempPath)) {
      throw new BadRequestException('Temp backup file not found');
    }

    return tempPath;
  }

  private async resolveSourcePath(
    sourceRef: string,
    source: BackupSourceType,
  ): Promise<string> {
    if (source === 'temp_upload_path') {
      return this.getTempUploadPath(sourceRef);
    }
    return this.getBackupPath(sourceRef);
  }

  async deleteBackup(filename: string) {
    const path = await this.getBackupPath(filename);
    unlinkSync(path);
  }

  async importBackup(tempPath: string, originalName: string): Promise<any> {
    const safeName = originalName.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const backupDir = await this.getStoragePath();
    const destPath = join(backupDir, safeName);

    if (existsSync(destPath)) {
      throw new BadRequestException('A backup with this name already exists');
    }

    try {
      renameSync(tempPath, destPath);
    } catch {
      copyFileSync(tempPath, destPath);
      unlinkSync(tempPath);
    }

    try {
      if (!safeName.endsWith('.enc') && !safeName.endsWith('.tar.gz')) {
        // Warning
      }
    } catch (e: unknown) {
      this.logger.warn(
        `Imported file ${safeName} validation warning: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    return {
      filename: safeName,
      status: 'imported',
      message: 'File added to backup history',
    };
  }

  async validateBackup(
    sourceRef: string,
    source: BackupSourceType = 'backup_name',
  ): Promise<{
    isValid: boolean;
    needsDecryptionKey: boolean;
    manifest?: any;
    error?: string;
    details?: string;
  }> {
    let filepath: string;
    try {
      filepath = await this.resolveSourcePath(sourceRef, source);
    } catch {
      return {
        isValid: false,
        needsDecryptionKey: false,
        error: 'File not found',
      };
    }

    const backupDir = await this.getStoragePath();
    const validId = Math.random().toString(36).substring(7);
    const tempDir = join(backupDir, `validate_${validId}`);
    const extractDir = join(tempDir, 'extracted');

    try {
      mkdirSync(extractDir, { recursive: true });

      const hmacKey = this.configService.get<string>('BACKUP_ENCRYPTION_KEY');
      if (!hmacKey) throw new InternalServerErrorException('Missing BACKUP_ENCRYPTION_KEY');
      const sigStatus = await this.verifyFileSignature(filepath, hmacKey);

      if (!sigStatus.hasSignature) {
        return {
          isValid: false,
          needsDecryptionKey: false,
          error: 'Security Error: Backup signature (.sig or appended) is missing. Cannot verify integrity.',
        };
      }

      if (sigStatus.hasSignature && !sigStatus.isValid) {
        return {
          isValid: false,
          needsDecryptionKey: false,
          error: 'Security Error: Invalid HMAC signature. Backup file is corrupted or tampered with.',
        };
      }

      try {
        await this.decryptAndExtract(
          filepath,
          extractDir,
          undefined,
          'manifest.json',
          sigStatus.hasSignature,
        );
      } catch (e: unknown) {
        if (
          e instanceof Error &&
          (e.message.includes('Decryption failed') ||
            e.message.includes('bad decrypt'))
        ) {
          return {
            isValid: false,
            needsDecryptionKey: true,
            error: 'Encrypted with unknown key',
          };
        }
        throw e;
      }

      const manifestPath = join(extractDir, 'manifest.json');
      if (!existsSync(manifestPath)) {
        return {
          isValid: false,
          needsDecryptionKey: false,
          error: 'Missing manifest.json',
        };
      }

      const manifestContent = readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent) as { appVersion?: string };
      const currentVersion = process.env.npm_package_version || 'unknown';
      const versionMismatch = manifest.appVersion !== currentVersion;

      return {
        isValid: true,
        needsDecryptionKey: false,
        manifest,
        details: versionMismatch
          ? `Version mismatch (Backup: ${manifest.appVersion}, Current: ${currentVersion})`
          : undefined,
      };
    } catch (error: unknown) {
      this.logger.error(`Validation failed for ${sourceRef}`, error);
      return {
        isValid: false,
        needsDecryptionKey: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    } finally {
      if (existsSync(tempDir))
        rmSync(tempDir, { recursive: true, force: true });
    }
  }

  async restoreSystemSnapshot(
    sourceRef: string,
    options: { decryptionKey?: string; force?: boolean } = {},
    source: BackupSourceType = 'backup_name',
  ): Promise<{ status: string; message: string }> {
    const filepath = await this.resolveSourcePath(sourceRef, source);

    const backupDir = await this.getStoragePath();
    const restoreId = Math.random().toString(36).substring(7);
    const tempDir = join(backupDir, `restore_${restoreId}`);
    const extractDir = join(tempDir, 'extracted');

    try {
      mkdirSync(extractDir, { recursive: true });

      const hmacKey = this.configService.get<string>('BACKUP_ENCRYPTION_KEY');
      if (!hmacKey) throw new InternalServerErrorException('Missing BACKUP_ENCRYPTION_KEY');
      const sigStatus = await this.verifyFileSignature(filepath, hmacKey);

      if (!sigStatus.hasSignature) {
        throw new BadRequestException('Security Error: Backup signature is missing. Restoration blocked.');
      }
      if (!sigStatus.isValid) {
        throw new BadRequestException('Security Error: Invalid HMAC signature. Backup file is corrupted or tampered with.');
      }

      await this.decryptAndExtract(filepath, extractDir, options.decryptionKey, undefined, sigStatus.hasSignature);

      const manifestPath = join(extractDir, 'manifest.json');
      if (!existsSync(manifestPath)) {
        throw new BadRequestException('Invalid Backup: Missing manifest.json');
      }

      const manifestContent = readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent) as { appVersion?: string };

      const currentVersion = process.env.npm_package_version || 'unknown';
      if (manifest.appVersion !== currentVersion && !options.force) {
        throw new BadRequestException(
          `Version Mismatch: Backup is ${manifest.appVersion}, App is ${currentVersion}. Use force to override.`,
        );
      }

      if (existsSync(join(extractDir, 'uploads'))) {
        const destUploads = join(process.cwd(), 'uploads');
        if (existsSync(destUploads))
          rmSync(destUploads, { recursive: true, force: true });
        cpSync(join(extractDir, 'uploads'), destUploads, { recursive: true });
      }

      const dumpPath = join(extractDir, 'db.dump');
      if (existsSync(dumpPath)) {
        await this.restoreDatabase(dumpPath);
      } else {
        this.logger.warn('No db.dump found in backup');
      }

      return { status: 'success', message: 'System restored successfully' };
    } catch (error) {
      this.logger.error('Restore failed', error);
      throw error;
    } finally {
      if (existsSync(tempDir))
        rmSync(tempDir, { recursive: true, force: true });
      if (source === 'temp_upload_path' && existsSync(filepath)) {
        try {
          unlinkSync(filepath);
        } catch (e) {
          this.logger.warn(`Failed to cleanup temp file ${filepath}`, e);
        }
      }
    }
  }

  private async decryptAndExtract(
    inputPath: string,
    outputDir: string,
    key?: string,
    fileToExtract?: string,
    hasSignature: boolean = false,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const stats = statSync(inputPath);
      // Strip the 72 bytes of signature if present, else read the whole file
      const streamEnd = hasSignature ? Math.max(0, stats.size - 73) : undefined;
      const input = createReadStream(inputPath, streamEnd !== undefined ? { end: streamEnd } : undefined);
      const isEncrypted = inputPath.endsWith('.enc');

      let stream: import('stream').Readable = input;
      if (isEncrypted) {
        try {
          const decrypt = this.encryptionService.createDecryptStream(key);
          stream = input.pipe(decrypt) as import('stream').Readable;
        } catch {
          return reject(
            new BadRequestException(
              'Decryption initialization failed. Key might be missing.',
            ),
          );
        }
      }

      const tempTar = join(outputDir, '../temp.tar.gz');
      const outTar = createWriteStream(tempTar);

      stream.pipe(outTar);

      stream.on('error', (e: unknown) => {
        const err = e instanceof Error ? e : new Error(String(e));
        this.logger.error(`Stream error: ${err.message}`, err.stack);
        if (isEncrypted) {
          reject(
            new BadRequestException(
              'Decryption failed. Invalid key or corrupt file.',
            ),
          );
        } else {
          reject(
            new BadRequestException(`Stream processing failed: ${err.message}`),
          );
        }
      });

      outTar.on('finish', () => {
        void (async () => {
          try {
            const tarCmd = fileToExtract
              ? `tar -xzf "${tempTar}" -C "${outputDir}" "${fileToExtract}"`
              : `tar -xzf "${tempTar}" -C "${outputDir}"`;

            await execAsync(tarCmd);
            resolve();
          } catch {
            if (fileToExtract) {
              reject(
                new BadRequestException(
                  `Could not extract ${fileToExtract} from archive`,
                ),
              );
            } else {
              reject(new BadRequestException('Archive extraction failed'));
            }
          } finally {
            if (existsSync(tempTar)) unlinkSync(tempTar);
          }
        })();
      });
      outTar.on('error', reject);
    });
  }

  private async restoreDatabase(dumpPath: string): Promise<void> {
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    try {
      await execAsync(
        `pg_restore --clean --if-exists --no-owner --dbname="${databaseUrl}" "${dumpPath}"`,
      );
    } catch (e) {
      this.logger.error('pg_restore failed', e);
      throw new Error('Database restore failed');
    }
  }

  private async signFile(filePath: string, key: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hmac = crypto.createHmac('sha256', key);
      const stream = createReadStream(filePath);
      stream.on('data', (chunk) => hmac.update(chunk));
      stream.on('end', () => resolve(hmac.digest('hex')));
      stream.on('error', reject);
    });
  }

  private async verifyFileSignature(filePath: string, key: string): Promise<{ hasSignature: boolean; isValid: boolean }> {
    try {
      const stats = statSync(filePath);
      if (stats.size < 72) return { hasSignature: false, isValid: false };

      const fd = openSync(filePath, 'r');
      const magicBuffer = Buffer.alloc(8);
      readSync(fd, magicBuffer, 0, 8, stats.size - 8);
      
      const isMagic = magicBuffer.toString('utf8') === '##HMAC##';
      if (!isMagic) {
        closeSync(fd);
        return { hasSignature: false, isValid: false };
      }

      const sigBuffer = Buffer.alloc(64);
      readSync(fd, sigBuffer, 0, 64, stats.size - 72);
      closeSync(fd);

      const expectedSignature = sigBuffer.toString('utf8');

      return await new Promise<{ hasSignature: boolean; isValid: boolean }>((resolve, reject) => {
        const hmac = crypto.createHmac('sha256', key);
        const stream = createReadStream(filePath, { start: 0, end: stats.size - 73 });
        stream.on('data', (chunk) => hmac.update(chunk));
        stream.on('end', () => {
          const actualSignature = hmac.digest('hex');
          try {
            const actualBuffer = Buffer.from(actualSignature, 'utf8');
            const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
            if (actualBuffer.length !== expectedBuffer.length) return resolve({ hasSignature: true, isValid: false });
            resolve({ hasSignature: true, isValid: crypto.timingSafeEqual(actualBuffer, expectedBuffer) });
          } catch {
            resolve({ hasSignature: true, isValid: false });
          }
        });
        stream.on('error', reject);
      });
    } catch {
      return { hasSignature: false, isValid: false };
    }
  }
}
