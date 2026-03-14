import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ProcedureStorageService {
  private readonly logger = new Logger(ProcedureStorageService.name);
  private readonly storageDir: string;

  constructor(private readonly config: ConfigService) {
    // Resolve path definitively against project root or configured env
    const configuredPath =
      this.config.get<string>('PROCEDURE_STORAGE_PATH') ||
      path.join(process.cwd(), 'storage', 'procedures');
    this.storageDir = path.resolve(configuredPath);
    this.ensureStorageDirectory();
  }

  private ensureStorageDirectory() {
    if (!fs.existsSync(this.storageDir)) {
      try {
        fs.mkdirSync(this.storageDir, { recursive: true });
        this.logger.log(
          `Created procedure storage directory at ${this.storageDir}`,
        );
      } catch (err) {
        this.logger.error(
          `Failed to create storage directory ${this.storageDir}: ${err}`,
        );
        throw new InternalServerErrorException(
          'Filesystem error preventing procedure storage initialization',
        );
      }
    }
  }

  /**
   * Builds a safe, deterministic filename enforcing task ID bound logic.
   * Prevents path traversal by strictly defining format without injection.
   */
  private getDeterministicFilename(
    taskId: number,
    originalExt: string,
  ): string {
    const cleanExt = originalExt.replace(/[^a-zA-Z0-9.-]/g, ''); // Basic sanitization
    return `${taskId}_procedure${cleanExt}`;
  }

  private getFilePath(filename: string): string {
    const normalizedFilename = path
      .normalize(filename)
      .replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.resolve(this.storageDir, normalizedFilename);
    // Protection strict contre path traversal en vérifiant que le chemin résolu reste dans storageDir
    if (!fullPath.startsWith(this.storageDir)) {
      throw new Error('Path traversal detected');
    }
    return fullPath;
  }

  /**
   * Store file deterministically on disk.
   * Guaranteed to overwrite any existing file with same taskId/ext automatically.
   */
  async storeProcedureFile(
    taskId: number,
    fileBuffer: Buffer,
    originalExt: string,
  ): Promise<string> {
    // Ne pas supprimer tout de suite pour permettre un rollback si la DB échoue.
    // L'ancien fichier ne sera écrasé direct que si l'extension est la même.

    const filename = this.getDeterministicFilename(taskId, originalExt);
    const filePath = this.getFilePath(filename);

    try {
      await fs.promises.writeFile(filePath, fileBuffer);
      this.logger.log(
        `Stored deterministic procedure file for Task ${taskId}: ${filename}`,
      );
      return `local:${filename}`;
    } catch (error) {
      this.logger.error(
        `Failed to write file to disk for task ${taskId}:`,
        error,
      );
      throw new InternalServerErrorException('Failed to store procedure file');
    }
  }

  /**
   * Wipes any uploaded file linked to a taskId, regardless of extension.
   */
  async deleteProcedureFile(taskId: number): Promise<void> {
    try {
      const files = await fs.promises.readdir(this.storageDir);
      // Delete all files matching `taskId_procedure` pattern to prevent orphan cross-extension (e.g .pdf AND .doc)
      const targetPrefix = `${taskId}_procedure`;

      for (const f of files) {
        if (f.startsWith(targetPrefix)) {
          const filePath = this.getFilePath(f);
          await fs.promises.unlink(filePath);
          this.logger.log(`Cleanup: Deleted old procedure file ${f}`);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Ignore if dir doesn't exist
        this.logger.error(
          `Error during procedure file cleanup for task ${taskId}:`,
          error,
        );
      }
    }
  }

  /**
   * Resolve a stored local filename back to absolute file path securely for streaming.
   */
  getFilePathForStreaming(filename: string): string {
    const filePath = this.getFilePath(filename);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(
        `Local procedure file ${filename} not found on disk.`,
      );
    }
    return filePath;
  }

  /**
   * Delete a specific procedure file securely. Use for rollbacks or targeted cleanup.
   */
  async deleteSpecificFile(filename: string): Promise<void> {
    try {
      const filePath = this.getFilePath(filename);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        this.logger.log(`Cleanup: Deleted specific procedure file ${filename}`);
      }
    } catch (error) {
      this.logger.error(`Error deleting specific file ${filename}:`, error);
    }
  }
}
