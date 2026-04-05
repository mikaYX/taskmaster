import { BadRequestException } from '@nestjs/common';
import { FileValidationPipe } from './file-validation.pipe';
import * as fs from 'fs';

// file-type is ESM-only — create a virtual mock for Jest's CJS resolution
const mockFromBuffer = jest.fn();
const mockFromFile = jest.fn();

jest.mock(
  'file-type',
  () => ({
    __esModule: true,
    default: {
      fromBuffer: mockFromBuffer,
      fromFile: mockFromFile,
      fileTypeFromBuffer: mockFromBuffer,
      fileTypeFromFile: mockFromFile,
    },
    fromBuffer: mockFromBuffer,
    fromFile: mockFromFile,
    fileTypeFromBuffer: mockFromBuffer,
    fileTypeFromFile: mockFromFile,
  }),
  { virtual: true },
);

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
    await expect(pipe.transform(undefined)).rejects.toThrow(
      BadRequestException,
    );
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
    mockFromBuffer.mockResolvedValue({ mime: 'image/svg+xml' });

    await expect(pipe.transform(file)).rejects.toThrow(/Invalid file type/);
    expect(mockFromBuffer).toHaveBeenCalledWith(file.buffer);
  });

  it('should allow valid mimetypes based on buffer', async () => {
    pipe = createPipe();
    const file = { size: 100, buffer: Buffer.from('valid') };
    mockFromBuffer.mockResolvedValue({ mime: 'image/png' });

    const result = await pipe.transform(file);
    expect(result).toBe(file);
  });

  it('should reject invalid mimetypes based on file path (disk storage)', async () => {
    pipe = createPipe();
    const file = { size: 100, path: '/tmp/test.svg' };
    mockFromFile.mockResolvedValue({ mime: 'image/svg+xml' });
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    await expect(pipe.transform(file)).rejects.toThrow(/Invalid file type/);
    expect(mockFromFile).toHaveBeenCalledWith('/tmp/test.svg');
    expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/test.svg'); // cleanup
  });

  it('should allow valid mimetypes based on file path (disk storage)', async () => {
    pipe = createPipe();
    const file = { size: 100, path: '/tmp/test.png' };
    mockFromFile.mockResolvedValue({ mime: 'image/png' });

    const result = await pipe.transform(file);
    expect(result).toBe(file);
    expect(fs.unlinkSync).not.toHaveBeenCalled();
  });

  it('should reject undefined magic bytes by default', async () => {
    pipe = createPipe();
    const file = { size: 100, buffer: Buffer.from('encrypted data') };
    mockFromBuffer.mockResolvedValue(undefined);

    await expect(pipe.transform(file)).rejects.toThrow(
      /Could not determine file type/,
    );
  });

  it('should allow undefined magic bytes if allowUndefinedMimeType is true and extension matches', async () => {
    pipe = createPipe({
      allowUndefinedMimeType: true,
      allowedExtensionsWhenUndefined: ['.enc'],
    });
    const file = {
      size: 100,
      buffer: Buffer.from('encrypted data'),
      originalname: 'backup.enc',
    };
    mockFromBuffer.mockResolvedValue(undefined);

    const result = await pipe.transform(file);
    expect(result).toBe(file);
  });

  it('should reject undefined magic bytes if allowUndefinedMimeType is true but extension is not allowed', async () => {
    pipe = createPipe({
      allowUndefinedMimeType: true,
      allowedExtensionsWhenUndefined: ['.enc'],
    });
    const file = {
      size: 100,
      buffer: Buffer.from('encrypted data'),
      originalname: 'malicious.svg',
    };
    mockFromBuffer.mockResolvedValue(undefined);

    await expect(pipe.transform(file)).rejects.toThrow(
      /extension .svg is not allowed/,
    );
  });
});
