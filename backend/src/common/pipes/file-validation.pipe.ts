import {
  PipeTransform,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import type { FileTypeResult } from 'file-type';
import * as fs from 'fs';

/** file-type v16 : fromBuffer / fromFile ; v21+ : fileTypeFromBuffer / fileTypeFromFile (résolution npm différente selon contexte). */
type FileTypeModuleLike = {
  fromBuffer?: (
    buffer: Buffer | Uint8Array | ArrayBuffer,
  ) => Promise<FileTypeResult | undefined>;
  fromFile?: (path: string) => Promise<FileTypeResult | undefined>;
  fileTypeFromBuffer?: (
    buffer: Buffer | Uint8Array | ArrayBuffer,
  ) => Promise<FileTypeResult | undefined>;
  fileTypeFromFile?: (path: string) => Promise<FileTypeResult | undefined>;
};

function resolveFileTypeDetectors(mod: FileTypeModuleLike) {
  const fromBuffer =
    mod.fileTypeFromBuffer ?? mod.fromBuffer;
  const fromFile =
    mod.fileTypeFromFile ?? mod.fromFile;
  if (!fromBuffer || !fromFile) {
    throw new Error(
      'file-type: aucune API reconnue (fromBuffer/fromFile ou fileTypeFromBuffer/fileTypeFromFile)',
    );
  }
  return { fromBuffer, fromFile };
}

export interface FileValidationOptions {
  allowedMimeTypes: string[];
  maxSizeBytes?: number;
  allowUndefinedMimeType?: boolean;
  allowedExtensionsWhenUndefined?: string[];
}

@Injectable()
export class FileValidationPipe implements PipeTransform {
  constructor(private readonly options: FileValidationOptions) {}

  async transform(value: any) {
    if (!value) {
      throw new BadRequestException('No file uploaded');
    }

    // Check size limit early if provided
    if (this.options.maxSizeBytes && value.size > this.options.maxSizeBytes) {
      // If disk storage was used, value.path exists
      if (value.path && fs.existsSync(value.path)) {
        fs.unlinkSync(value.path);
      }
      throw new BadRequestException(
        `File too large. Maximum size is ${this.options.maxSizeBytes} bytes.`,
      );
    }

    // ESM-only selon version : import dynamique + support v16 et v21 (Docker vs workspace)
    const ft = (await import(
      'file-type'
    )) as unknown as FileTypeModuleLike;
    const { fromBuffer, fromFile } = resolveFileTypeDetectors(ft);

    let detectedType: FileTypeResult | undefined;

    // Buffer is available (memory storage)
    if (value.buffer) {
      detectedType = await fromBuffer(value.buffer);
    }
    // File is on disk (disk storage)
    else if (value.path) {
      detectedType = await fromFile(value.path);
    } else {
      throw new BadRequestException('Invalid file object structure');
    }

    // Verify magic bytes
    if (!detectedType) {
      if (!this.options.allowUndefinedMimeType) {
        if (value.path && fs.existsSync(value.path)) fs.unlinkSync(value.path);
        throw new BadRequestException(
          'Could not determine file type from magic bytes. File rejected for security.',
        );
      }
      if (this.options.allowedExtensionsWhenUndefined && value.originalname) {
        const path = require('path');
        const ext = path.extname(value.originalname).toLowerCase();
        if (!this.options.allowedExtensionsWhenUndefined.includes(ext)) {
          if (value.path && fs.existsSync(value.path)) fs.unlinkSync(value.path);
          throw new BadRequestException(
            `File type is unknown, and extension ${ext} is not allowed.`,
          );
        }
      }
    } else if (!this.options.allowedMimeTypes.includes(detectedType.mime)) {
      // Clean up if it was already saved to disk
      if (value.path && fs.existsSync(value.path)) {
        fs.unlinkSync(value.path);
      }

      throw new BadRequestException(
        `Invalid file type. Allowed types: ${this.options.allowedMimeTypes.join(', ')}. Magic bytes detected: ${detectedType.mime}`,
      );
    }

    return value;
  }
}

