import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  utimesSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ExportService } from './export.service';

describe('ExportService - export folder', () => {
  let dataDir: string;
  let exportPath: string | undefined;
  const settings = {
    getRawValue: jest.fn(async (key: string) =>
      key === 'export.path' ? exportPath : undefined,
    ),
  };
  const make = () =>
    new ExportService({ client: {} } as never, {} as never, settings as never);

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'tm-export-'));
    process.env.TASKMASTER_DATA_DIR = dataDir;
    exportPath = undefined;
  });

  afterEach(() => {
    delete process.env.TASKMASTER_DATA_DIR;
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('defaults to an "exports" folder of the data root, outside the backups', async () => {
    expect(await make().resolveExportDir()).toBe(join(dataDir, 'exports'));
  });

  it('honours an absolute folder from the settings', async () => {
    const custom = join(dataDir, 'D-share', 'exports');
    exportPath = custom;

    expect(await make().resolveExportDir()).toBe(custom);
  });

  it('resolves a relative folder against the data root', async () => {
    exportPath = './sorties';

    expect(await make().resolveExportDir()).toBe(join(dataDir, 'sorties'));
  });

  it('still serves a file written to the old backups/exports folder', async () => {
    const legacy = join(dataDir, 'backups', 'exports');
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, 'export_old.json'), '{}');

    expect(await make().getExportPath('export_old.json')).toBe(
      join(legacy, 'export_old.json'),
    );
  });

  it('refuses a file name that climbs out of the folder', async () => {
    await expect(make().getExportPath('../secret')).rejects.toThrow();
  });

  it('lists only export files across current and legacy folders without duplicates', async () => {
    const service = make();
    const current = await service.resolveExportDir();
    const legacy = join(dataDir, 'backups', 'exports');
    mkdirSync(current, { recursive: true });
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(current, 'export_current.zip'), 'current');
    writeFileSync(join(legacy, 'export_old.json'), '{}');
    writeFileSync(join(legacy, 'export_current.zip'), 'duplicate');
    writeFileSync(join(current, 'backup_database.tar.gz.enc'), 'backup');
    mkdirSync(join(current, 'export_directory'));

    const files = await service.listExports();
    expect(files.map((file) => file.filename).sort()).toEqual([
      'export_current.zip',
      'export_old.json',
    ]);
    expect(
      files.find((file) => file.filename === 'export_current.zip')?.size,
    ).toBe(7);
    expect(files[0].createdAt.getTime()).toBeGreaterThanOrEqual(
      files[1].createdAt.getTime(),
    );
  });

  it('cleans expired exports in both folders and leaves other files alone', async () => {
    const service = make();
    const current = await service.resolveExportDir();
    const legacy = join(dataDir, 'backups', 'exports');
    mkdirSync(current, { recursive: true });
    mkdirSync(legacy, { recursive: true });
    const old = new Date(Date.now() - 40 * 24 * 3600 * 1000);
    for (const file of [
      join(current, 'export_a.json'),
      join(legacy, 'export_b.json'),
      join(current, 'notes.txt'),
    ]) {
      writeFileSync(file, 'x');
      utimesSync(file, old, old);
    }

    expect(await service.cleanupExpired(30)).toBe(2);
    expect(existsSync(join(current, 'notes.txt'))).toBe(true);
  });
});
