import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getUploadsDir } from '../config/app-paths';
import { SettingsUploads } from './settings-uploads';

jest.mock('../config/app-paths', () => ({ getUploadsDir: jest.fn() }));

describe('SettingsUploads', () => {
  let directory: string;
  const uploads = new SettingsUploads();
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'settings-uploads-'));
    jest.mocked(getUploadsDir).mockReturnValue(directory);
    jest.spyOn(Date, 'now').mockReturnValue(1234);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(directory, { recursive: true, force: true });
  });
  it.each(['logo', 'logodark', 'favicon', 'wallpaper'] as const)(
    'replaces only files of type %s and keeps the response shape',
    (type) => {
      for (const prefix of ['logo', 'logodark', 'favicon', 'wallpaper']) {
        writeFileSync(join(directory, prefix + '-old.png'), 'old');
      }
      const file = {
        mimetype: 'image/png',
        originalname: 'picture.png',
        buffer: Buffer.from('image'),
      };
      expect(uploads.save(file, type)).toEqual({
        url: `/public/uploads/${type}-1234.png`,
        originalName: 'picture.png',
      });
      expect(readFileSync(join(directory, type + '-1234.png'))).toEqual(
        file.buffer,
      );
      expect(readdirSync(directory)).not.toContain(type + '-old.png');
      expect(readdirSync(directory)).toHaveLength(4);
    },
  );
});
