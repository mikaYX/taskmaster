import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  createWriteStream,
  writeFileSync,
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
import { spawn } from 'child_process';
import { pipeline } from 'stream/promises';
import * as archiver from 'archiver';
import * as crypto from 'crypto';
import { SettingsService } from '../settings';
import { EncryptionService } from './encryption.service';

import {
  getBackupSystemDir,
  getBackupTempUploadsDir,
  getPgBinaryPath,
  getProcedureStorageDir,
  getEvidenceStorageDir,
  getUploadsDir,
  resolveDataPath,
} from '../config/app-paths';

export type BackupSourceType = 'backup_name' | 'temp_upload_path';

@Injectable()
export class BackupLogicService {
  private readonly logger = new Logger(BackupLogicService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly settings: SettingsService,
    private readonly encryptionService: EncryptionService,
  ) {}

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

    const rawPath = settingPath || configPath || getBackupSystemDir();

    // Resolve relative paths against the writable service data root.
    const absolutePath = resolveDataPath(rawPath);

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
    const partialPath = `${finalPath}.partial`;

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
      writeFileSync(
        join(tempDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
      );

      // 3. Collect Artifacts (if FULL)
      if (type === 'FULL') {
        this.collectSystemArtifacts(tempDir);
      }

      // 4. Create Archive & Encrypt Stream
      await this.archiveAndEncrypt(tempDir, partialPath);

      // 4.5 Sign Archive with HMAC SHA256
      const hmacKey = this.configService.get<string>('BACKUP_ENCRYPTION_KEY');
      if (!hmacKey)
        throw new InternalServerErrorException('Missing BACKUP_ENCRYPTION_KEY');
      const signature = await this.signFile(partialPath, hmacKey);
      appendFileSync(partialPath, Buffer.from(signature + '##HMAC##', 'utf8'));
      renameSync(partialPath, finalPath);

      // 5. Cleanup Temp
      rmSync(tempDir, { recursive: true, force: true });

      const stats = statSync(finalPath);
      this.logger.log(
        `Backup created successfully: ${finalFilename} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`,
      );

      // A retention failure must not delete a successfully signed backup.
      try {
        await this.cleanupExpired();
      } catch (error) {
        this.logger.warn(
          `Backup created, but retention cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }

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
      if (existsSync(partialPath)) unlinkSync(partialPath);
      if (existsSync(finalPath)) unlinkSync(finalPath);
      throw new InternalServerErrorException(
        'Backup creation failed: ' +
          (error instanceof Error ? error.message : String(error)),
      );
    }
  }

  /** Run directly, without cmd.exe/sh quoting or binary stdout conversion. */
  private async runTool(
    executable: string,
    args: string[],
    env: NodeJS.ProcessEnv = process.env,
    outputPath?: string,
  ): Promise<void> {
    const outputFd = outputPath ? openSync(outputPath, 'w') : undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(executable, args, {
          env,
          windowsHide: true,
          timeout: 300000,
          stdio: ['ignore', outputFd ?? 'ignore', 'pipe'],
        });
        let stderr = '';
        child.stderr?.on('data', (chunk: Buffer) => {
          stderr = (stderr + chunk.toString()).slice(-65536);
        });
        let spawnError: Error | undefined;
        child.on('error', (error) => {
          spawnError = error;
        });
        // close fires after stdio is closed, including after a spawn error.
        child.on('close', (code, signal) => {
          if (spawnError) return reject(spawnError);
          if (code === 0) return resolve();
          const detail =
            stderr.trim() || `exit code ${code}, signal ${signal ?? 'none'}`;
          reject(new Error(detail));
        });
      });
    } finally {
      if (outputFd !== undefined) closeSync(outputFd);
    }
  }

  private getDatabaseEnv(): NodeJS.ProcessEnv {
    const databaseUrl = this.configService.get<string>('DATABASE_URL');
    if (!databaseUrl)
      throw new BadRequestException('DATABASE_URL not configured');
    let url: URL;
    try {
      url = new URL(databaseUrl);
      if (!['postgres:', 'postgresql:'].includes(url.protocol))
        throw new Error();
    } catch {
      throw new BadRequestException(
        'DATABASE_URL must be a valid PostgreSQL URL',
      );
    }
    return {
      ...process.env,
      PGPASSWORD: decodeURIComponent(url.password),
      PGUSER: decodeURIComponent(url.username),
      PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
      PGPORT: url.port || '5432',
      PGDATABASE: decodeURIComponent(url.pathname.substring(1)),
      PGCONNECT_TIMEOUT: '15',
      ...(url.searchParams.has('sslmode')
        ? { PGSSLMODE: url.searchParams.get('sslmode')! }
        : {}),
    };
  }

  private safeToolError(error: unknown, env: NodeJS.ProcessEnv): string {
    let message = error instanceof Error ? error.message : String(error);
    for (const secret of [
      env.PGPASSWORD,
      this.configService.get<string>('DATABASE_URL'),
    ]) {
      if (secret) message = message.split(secret).join('****');
    }
    return message;
  }

  private async dumpDatabase(targetDir: string): Promise<void> {
    const env = this.getDatabaseEnv();
    const dumpPath = join(targetDir, 'db.dump');
    const binary = getPgBinaryPath('pg_dump');
    try {
      await this.runTool(binary, ['--format=c', '--file', dumpPath], env);
    } catch (error) {
      const message = this.safeToolError(error, env);
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && !message.includes('server version mismatch')) {
        throw new Error(`pg_dump failed: ${message}`);
      }

      const fallbackErrors: string[] = [];
      for (const container of this.getDockerPgDumpContainerCandidates(env)) {
        try {
          // Docker inherits PGPASSWORD from env; never put its value in argv.
          await this.runTool(
            'docker',
            [
              'exec',
              '-e',
              'PGPASSWORD',
              container,
              'pg_dump',
              '-U',
              env.PGUSER || 'taskmaster',
              '--format=c',
              env.PGDATABASE || 'taskmaster',
            ],
            env,
            dumpPath,
          );
          if (statSync(dumpPath).size === 0)
            throw new Error('Docker pg_dump produced an empty dump');
          return;
        } catch (dockerError) {
          fallbackErrors.push(
            `${container}: ${this.safeToolError(dockerError, env)}`,
          );
        }
      }
      throw new Error(
        `Database dump failed: ${message}. Check PG_BIN_PATH (PostgreSQL bin directory), ` +
          `the PostgreSQL client version and service account permissions. ` +
          `Docker fallback failed: ${fallbackErrors.join(' | ')}`,
      );
    }
    if (!existsSync(dumpPath) || statSync(dumpPath).size === 0) {
      throw new Error('pg_dump produced an empty database dump');
    }
  }

  private getDockerPgDumpContainerCandidates(env: NodeJS.ProcessEnv): string[] {
    const configuredContainer = this.configService
      .get<string>('BACKUP_DOCKER_CONTAINER')
      ?.trim();
    const hostContainer = this.isNonLocalHost(env.PGHOST)
      ? env.PGHOST?.trim()
      : undefined;

    return Array.from(
      new Set(
        [
          configuredContainer,
          hostContainer,
          'taskmaster_db',
          'taskmaster_local_db',
        ].filter((value): value is string => !!value && value.length > 0),
      ),
    );
  }

  private isNonLocalHost(host?: string): boolean {
    const normalizedHost = host?.trim().toLowerCase();

    return (
      !!normalizedHost &&
      !['localhost', '127.0.0.1', '::1'].includes(normalizedHost)
    );
  }

  private collectSystemArtifacts(targetDir: string): void {
    // Resolve artifacts from the same data root as uploads and procedures.
    const uploadsSrc = getUploadsDir();

    this.logger.log(`Collecting artifacts from: ${uploadsSrc}`);

    if (existsSync(uploadsSrc)) {
      try {
        mkdirSync(join(targetDir, 'uploads'), { recursive: true });
        cpSync(uploadsSrc, join(targetDir, 'uploads'), { recursive: true });
        this.logger.log('Uploads collected successfully');
      } catch (err) {
        this.logger.error('Failed to copy uploads', err);
        throw err; // A FULL snapshot must not silently omit files.
      }
    }

    const evidenceSrc = getEvidenceStorageDir(false);
    if (existsSync(evidenceSrc))
      cpSync(evidenceSrc, join(targetDir, 'evidence'), { recursive: true });
    const proceduresSrc = getProcedureStorageDir();
    cpSync(proceduresSrc, join(targetDir, 'procedures'), { recursive: true });

    // SECURITY (AUDIT.md Finding #4): .env is NEVER included in a FULL backup.
    // Rationale: an exfiltrated archive must not bootstrap an attack — the .env
    // contains AUTH_SECRET, BACKUP_ENCRYPTION_KEY (the one that could decrypt
    // this very archive), DATABASE_URL credentials and OIDC/SAML/SMTP secrets.
    // Operators must reconfigure secrets from their KMS / vault on restore.
    this.logger.log(
      'System artifact collection skipping .env by design (AUDIT #4). ' +
        'Reconfigure secrets from the vault on restore.',
    );
  }

  private async archiveAndEncrypt(
    sourceDir: string,
    destPath: string,
  ): Promise<void> {
    const archive = archiver.default('tar', {
      gzip: true,
      gzipOptions: { level: 9 },
    });
    const completion = pipeline(
      archive,
      this.encryptionService.createEncryptStream(),
      createWriteStream(destPath),
    );
    archive.directory(sourceDir, false);
    await Promise.all([completion, archive.finalize()]);
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

    const tempPath = join(getBackupTempUploadsDir(), filename);
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
      if (!hmacKey)
        throw new InternalServerErrorException('Missing BACKUP_ENCRYPTION_KEY');
      const sigStatus = await this.verifyFileSignature(filepath, hmacKey);

      if (!sigStatus.hasSignature) {
        return {
          isValid: false,
          needsDecryptionKey: false,
          error:
            'Security Error: Backup signature (.sig or appended) is missing. Cannot verify integrity.',
        };
      }

      if (sigStatus.hasSignature && !sigStatus.isValid) {
        return {
          isValid: false,
          needsDecryptionKey: false,
          error:
            'Security Error: Invalid HMAC signature. Backup file is corrupted or tampered with.',
        };
      }

      try {
        await this.decryptAndExtract(
          filepath,
          extractDir,
          undefined,
          ['manifest.json', 'db.dump'],
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
      this.requireDatabaseDump(extractDir);
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

  private requireDatabaseDump(directory: string): string {
    const dumpPath = join(directory, 'db.dump');
    if (
      !existsSync(dumpPath) ||
      !statSync(dumpPath).isFile() ||
      statSync(dumpPath).size === 0
    ) {
      throw new BadRequestException('Invalid Backup: Missing or empty db.dump');
    }
    return dumpPath;
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
      if (!hmacKey)
        throw new InternalServerErrorException('Missing BACKUP_ENCRYPTION_KEY');
      const sigStatus = await this.verifyFileSignature(filepath, hmacKey);

      if (!sigStatus.hasSignature) {
        throw new BadRequestException(
          'Security Error: Backup signature is missing. Restoration blocked.',
        );
      }
      if (!sigStatus.isValid) {
        throw new BadRequestException(
          'Security Error: Invalid HMAC signature. Backup file is corrupted or tampered with.',
        );
      }

      await this.decryptAndExtract(
        filepath,
        extractDir,
        options.decryptionKey,
        undefined,
        sigStatus.hasSignature,
      );

      const manifestPath = join(extractDir, 'manifest.json');
      if (!existsSync(manifestPath)) {
        throw new BadRequestException('Invalid Backup: Missing manifest.json');
      }

      const manifestContent = readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent) as { appVersion?: string };

      const dumpPath = this.requireDatabaseDump(extractDir);
      const currentVersion = process.env.npm_package_version || 'unknown';
      if (manifest.appVersion !== currentVersion && !options.force) {
        throw new BadRequestException(
          `Version Mismatch: Backup is ${manifest.appVersion}, App is ${currentVersion}. Use force to override.`,
        );
      }

      if (existsSync(join(extractDir, 'uploads'))) {
        const destUploads = getUploadsDir();
        if (existsSync(destUploads))
          rmSync(destUploads, { recursive: true, force: true });
        cpSync(join(extractDir, 'uploads'), destUploads, { recursive: true });
      }

      if (existsSync(join(extractDir, 'evidence'))) {
        cpSync(join(extractDir, 'evidence'), getEvidenceStorageDir(), {
          recursive: true,
        });
      }

      if (existsSync(join(extractDir, 'procedures'))) {
        const destProcedures = getProcedureStorageDir();
        cpSync(join(extractDir, 'procedures'), destProcedures, {
          recursive: true,
        });
      }

      await this.restoreDatabase(dumpPath);

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
    fileToExtract?: string | string[],
    hasSignature: boolean = false,
  ): Promise<void> {
    const stats = statSync(inputPath);
    const streamEnd = hasSignature ? Math.max(0, stats.size - 73) : undefined;
    const tempTar = join(outputDir, '../temp.tar.gz');
    const isEncrypted = inputPath.endsWith('.enc');
    try {
      // Initialize the decryptor before opening files, and await closed handles
      // before extraction/cleanup (required on Windows).
      const decrypt = isEncrypted
        ? this.encryptionService.createDecryptStream(key)
        : undefined;
      const input = createReadStream(
        inputPath,
        streamEnd !== undefined ? { end: streamEnd } : undefined,
      );
      const output = createWriteStream(tempTar);
      try {
        if (decrypt) await pipeline(input, decrypt, output);
        else await pipeline(input, output);
      } catch {
        throw new BadRequestException(
          isEncrypted
            ? 'Decryption failed. Invalid key or corrupt file.'
            : 'Stream processing failed',
        );
      }
      await this.runTool('tar', [
        '-xzf',
        tempTar,
        '-C',
        outputDir,
        ...(fileToExtract
          ? Array.isArray(fileToExtract)
            ? fileToExtract
            : [fileToExtract]
          : []),
      ]);
    } finally {
      if (existsSync(tempTar)) unlinkSync(tempTar);
    }
  }

  private async restoreDatabase(dumpPath: string): Promise<void> {
    const env = this.getDatabaseEnv();
    try {
      await this.runTool(
        getPgBinaryPath('pg_restore'),
        [
          '--clean',
          '--if-exists',
          '--no-owner',
          '--exit-on-error',
          '--dbname',
          env.PGDATABASE || 'taskmaster',
          dumpPath,
        ],
        env,
      );
    } catch (error) {
      throw new Error(
        `Database restore failed: ${this.safeToolError(error, env)}. Check PG_BIN_PATH and service account permissions.`,
      );
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

  private async verifyFileSignature(
    filePath: string,
    key: string,
  ): Promise<{ hasSignature: boolean; isValid: boolean }> {
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

      return await new Promise<{ hasSignature: boolean; isValid: boolean }>(
        (resolve, reject) => {
          const hmac = crypto.createHmac('sha256', key);
          const stream = createReadStream(filePath, {
            start: 0,
            end: stats.size - 73,
          });
          stream.on('data', (chunk) => hmac.update(chunk));
          stream.on('end', () => {
            const actualSignature = hmac.digest('hex');
            try {
              const actualBuffer = Buffer.from(actualSignature, 'utf8');
              const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
              if (actualBuffer.length !== expectedBuffer.length)
                return resolve({ hasSignature: true, isValid: false });
              resolve({
                hasSignature: true,
                isValid: crypto.timingSafeEqual(actualBuffer, expectedBuffer),
              });
            } catch {
              resolve({ hasSignature: true, isValid: false });
            }
          });
          stream.on('error', reject);
        },
      );
    } catch {
      return { hasSignature: false, isValid: false };
    }
  }
}
