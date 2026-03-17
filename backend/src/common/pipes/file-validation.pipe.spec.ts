import { BadRequestException } from '@nestjs/common';
import { FileValidationPipe } from './file-validation.pipe';
import * as fileType from 'file-type';
import * as fs from 'fs';

jest.mock('file-type');
jest.mock('fs');

describe('FileValidationPipe', () => {
  let pipe: FileValidationPipe;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const createPipe = (options = {}) => {
    return new FileValidationPipe({
      allowedMimeTypes: ['image/png', 'image/jpeg'],
      ...options,
    });
  };

  it('should throw if no file is provided', async () => {
    pipe = createPipe();
    await expect(pipe.transform(undefined)).rejects.toThrow(BadRequestException);
  });

  it('should reject files exceeding maxSizeBytes', async () => {
    pipe = createPipe({ maxSizeBytes: 1000 });
    const file = { size: 2000, buffer: Buffer.from('test') };
    await expect(pipe.transform(file)).rejects.toThrow(/File too large/);
  });

  it('should delete file from disk if size exceeded (disk storage)', async () => {
    pipe = createPipe({ maxSizeBytes: 1000 });
    const file = { size: 2000, path: '/tmp/test.jpg' };
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    await expect(pipe.transform(file)).rejects.toThrow(/File too large/);
    expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/test.jpg');
  });

  it('should reject SVG or other invalid mimetypes based on buffer', async () => {
    pipe = createPipe();
    const file = { size: 100, buffer: Buffer.from('invalid') };
    (fileType.fromBuffer as jest.Mock).mockResolvedValue({ mime: 'image/svg+xml' });

    await expect(pipe.transform(file)).rejects.toThrow(/Invalid file type/);
    expect(fileType.fromBuffer).toHaveBeenCalledWith(file.buffer);
  });

  it('should allow valid mimetypes based on buffer', async () => {
    pipe = createPipe();
    const file = { size: 100, buffer: Buffer.from('valid') };
    (fileType.fromBuffer as jest.Mock).mockResolvedValue({ mime: 'image/png' });

    const result = await pipe.transform(file);
    expect(result).toBe(file);
  });

  it('should reject invalid mimetypes based on file path (disk storage)', async () => {
    pipe = createPipe();
    const file = { size: 100, path: '/tmp/test.svg' };
    (fileType.fromFile as jest.Mock).mockResolvedValue({ mime: 'image/svg+xml' });
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    await expect(pipe.transform(file)).rejects.toThrow(/Invalid file type/);
    expect(fileType.fromFile).toHaveBeenCalledWith('/tmp/test.svg');
    expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/test.svg'); // cleanup
  });

  it('should allow valid mimetypes based on file path (disk storage)', async () => {
    pipe = createPipe();
    const file = { size: 100, path: '/tmp/test.png' };
    (fileType.fromFile as jest.Mock).mockResolvedValue({ mime: 'image/png' });

    const result = await pipe.transform(file);
    expect(result).toBe(file);
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });

  it('should reject undefined magic bytes by default', async () => {
    pipe = createPipe();
    const file = { size: 100, buffer: Buffer.from('encrypted data') };
    (fileType.fromBuffer as jest.Mock).mockResolvedValue(undefined);

    await expect(pipe.transform(file)).rejects.toThrow(/Could not determine file type/);
  });

  it('should allow undefined magic bytes if allowUndefinedMimeType is true and extension matches', async () => {
    pipe = createPipe({ allowUndefinedMimeType: true, allowedExtensionsWhenUndefined: ['.enc'] });
    const file = { size: 100, buffer: Buffer.from('encrypted data'), originalname: 'backup.enc' };
    (fileType.fromBuffer as jest.Mock).mockResolvedValue(undefined);

    const result = await pipe.transform(file);
    expect(result).toBe(file);
  });

  it('should reject undefined magic bytes if allowUndefinedMimeType is true but extension is not allowed', async () => {
    pipe = createPipe({ allowUndefinedMimeType: true, allowedExtensionsWhenUndefined: ['.enc'] });
    const file = { size: 100, buffer: Buffer.from('encrypted data'), originalname: 'malicious.svg' };
    (fileType.fromBuffer as jest.Mock).mockResolvedValue(undefined);

    await expect(pipe.transform(file)).rejects.toThrow(/extension .svg is not allowed/);
  });
});
