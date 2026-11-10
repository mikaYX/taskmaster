import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { getUploadsDir } from '../config/app-paths';

@Injectable()
export class SettingsUploads {
  save(
    file: { mimetype: string; originalname: string; buffer: Buffer },
    // 'logodark' must not start with 'logo-': the per-type cleanup matches `${type}-`
    type: 'logo' | 'logodark' | 'favicon' | 'wallpaper',
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Save file (simple local storage)
    const uploadsDir = getUploadsDir();

    // Clean up old files of same type to prevent accumulation
    try {
      const files = fs.readdirSync(uploadsDir);
      for (const f of files) {
        if (f.startsWith(`${type}-`)) {
          fs.unlinkSync(path.join(uploadsDir, f));
        }
      }
    } catch (error) {
      // Ignore errors (e.g. permission issues or race conditions), continue with upload
      console.warn(`Failed to cleanup old ${type} files:`, error);
    }

    const ext = path.extname(file.originalname);
    const filename = `${type}-${Date.now()}${ext}`;
    const filepath = path.join(uploadsDir, filename);

    fs.writeFileSync(filepath, file.buffer);

    return {
      url: `/public/uploads/${filename}`,

      originalName: file.originalname,
    };
  }
}
