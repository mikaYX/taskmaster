import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { join } from 'path';
import { getDataDir, resolveDataPath } from '../config/app-paths';
import { SettingsService } from '../settings';
import {
  createWriteStream,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
} from 'fs';
import { EncryptionService } from './encryption.service';
import archiver from 'archiver';

export interface ExportOptions {
  format: 'json' | 'csv';
  encrypt: boolean;
  password?: string;
}

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryptionService: EncryptionService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Absolute folder the exports are written to: the `export.path` setting
   * (default `./exports`, resolved against the data root, so
   * `<data>exports`). It used to be ignored: exports always landed in
   * `<data>ackupsexports`, mixed in with the database backups.
   */
  async resolveExportDir(): Promise<string> {
    const raw = (
      (await this.settings.getRawValue<string>('export.path')) || ''
    ).trim();
    return resolveDataPath(raw || './exports');
  }

  /** Where exports were written before `export.path` was honoured. */
  private legacyExportDir(): string {
    return join(getDataDir(), 'backups', 'exports');
  }

  private async exportDirs(): Promise<string[]> {
    return Array.from(
      new Set([await this.resolveExportDir(), this.legacyExportDir()]),
    );
  }

  async listExports() {
    const files = new Map<
      string,
      { filename: string; size: number; createdAt: Date }
    >();
    for (const dir of await this.exportDirs()) {
      if (!existsSync(dir)) continue;
      for (const filename of readdirSync(dir)) {
        if (!filename.startsWith('export_') || files.has(filename)) continue;
        const stat = statSync(join(dir, filename));
        if (!stat.isFile()) continue;
        files.set(filename, {
          filename,
          size: stat.size,
          createdAt: stat.birthtime,
        });
      }
    }
    return [...files.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  /**
   * Generate a portable export (Business Data).
   * @param options format, encryption settings
   */
  async generateExport(options: ExportOptions): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = options.format === 'json' ? 'json' : 'zip'; // CSVs zipped
    const filename = `export_${timestamp}_business.${extension}${options.encrypt ? '.enc' : ''}`;
    const exportDir = await this.resolveExportDir();
    mkdirSync(exportDir, { recursive: true });
    const filepath = join(exportDir, filename);

    this.logger.log(`Generating business export: ${filename}`);

    // 1. Fetch Data
    const data = await this.fetchBusinessData();

    // 2. Prepare Output Stream
    const writeStream = createWriteStream(filepath);

    let outputStream: any = writeStream;

    // 3. Encrypt if requested
    if (options.encrypt) {
      if (!options.password) {
        throw new Error('Encryption password required for manual exports');
      }
      const encryptStream = this.encryptionService.createEncryptStream(
        options.password,
      );
      encryptStream.pipe(writeStream);
      outputStream = encryptStream;
    }

    // 4. Write Data
    return new Promise((resolve, reject) => {
      writeStream.on('finish', () => resolve(filepath));
      writeStream.on('error', (err) => reject(err));

      if (options.format === 'json') {
        outputStream.write(JSON.stringify(data, null, 2));
        outputStream.end();
      } else {
        // CSV Logic: Create a ZIP containing CSV files
        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.on('error', (err: any) => reject(err));
        archive.pipe(outputStream);

        // Add CSV files
        archive.append(this.toCSV(data.users), { name: 'users.csv' });
        archive.append(this.toCSV(data.groups), { name: 'groups.csv' });

        // For tasks, flatten assignments for better CSV readability
        const flatTasks = data.tasks.map((t) => ({
          ...t,
          userAssignments: t.userAssignments.map((ua) => ua.userId).join(';'),
          groupAssignments: t.groupAssignments
            .map((ga) => ga.groupId)
            .join(';'),
        }));
        archive.append(this.toCSV(flatTasks), { name: 'tasks.csv' });

        archive.finalize();
      }
    });
  }

  private toCSV(items: any[]): string {
    if (!items || items.length === 0) return '';

    // Collect all unique keys from all items to ensure incomplete objects don't break headers
    const keys = Array.from(new Set(items.flatMap(Object.keys)));

    const header = keys.join(',');
    const rows = items.map((row) => {
      return keys
        .map((key) => {
          const val = row[key];
          if (val === null || val === undefined) return '';

          let str = String(val);
          // Handle objects/arrays (convert to JSON string if needed, mostly for safety)
          if (typeof val === 'object') str = JSON.stringify(val);

          // Prevent CSV Injection (M3)
          if (/^[=\-+@]/.test(str)) {
            str = "'" + str;
          }

          // Escape CSV special chars
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(',');
    });

    return [header, ...rows].join('\n');
  }

  async getExportPath(filename: string): Promise<string> {
    if (
      filename.includes('..') ||
      filename.includes('/') ||
      filename.includes('\\')
    ) {
      throw new Error('Invalid filename');
    }
    // Files written before the export folder became configurable stay reachable.
    for (const dir of await this.exportDirs()) {
      const filepath = join(dir, filename);
      if (existsSync(filepath)) return filepath;
    }
    throw new Error('Export file not found');
  }

  private async fetchBusinessData() {
    const [users, tasks, groups] = await Promise.all([
      this.prisma.client.user.findMany({
        select: {
          id: true,
          username: true,
          fullname: true,
          email: true,
          role: true,
          authProvider: true,
          createdAt: true,
        },
      }),
      this.prisma.client.task.findMany({
        include: {
          userAssignments: { select: { userId: true } },
          groupAssignments: { select: { groupId: true } },
        },
      }),
      this.prisma.client.group.findMany(),
    ]);

    return {
      meta: {
        version: '1.0',
        generatedAt: new Date(),
        type: 'BUSINESS_EXPORT',
      },
      users,
      tasks,
      groups,
    };
  }

  async cleanupExpired(maxAgeDays = 7): Promise<number> {
    if (!Number.isFinite(maxAgeDays) || maxAgeDays <= 0) {
      // 0 or negative means retention disabled ("keep forever")
      return 0;
    }

    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    let deleted = 0;

    for (const dir of await this.exportDirs()) {
      if (!existsSync(dir)) continue;
      // Only our own files: an administrator may point the export folder at a
      // shared folder that holds other things.
      for (const file of readdirSync(dir).filter((f) =>
        f.startsWith('export_'),
      )) {
        const filepath = join(dir, file);
        try {
          const stat = statSync(filepath);
          if (stat.isFile() && now - stat.mtimeMs > maxAgeMs) {
            unlinkSync(filepath);
            deleted++;
            this.logger.log(`Deleted expired export: ${file}`);
          }
        } catch (e: any) {
          this.logger.error(`Failed to cleanup ${file}: ${e.message}`);
        }
      }
    }

    return deleted;
  }
}
