import { win32 as win32Path } from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getAppPackageJsonPath,
  getClientDir,
  getDataDir,
  getInstallDir,
  getLogsDir,
  getPgBinaryPath,
  getProcedureStorageDir,
  getUploadsDir,
  resolveDataPath,
} from './app-paths';

describe('app-paths', () => {
  const ORIGINAL_ENV = { ...process.env };
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'app-paths-'));
    delete process.env.TASKMASTER_INSTALL_DIR;
    delete process.env.TASKMASTER_DATA_DIR;
    delete process.env.PROCEDURE_STORAGE_PATH;
    delete process.env.BACKUP_STORAGE_PATH;
    delete process.env.PG_BIN_PATH;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('defaults every root to process.cwd() on non-win32 when the new env vars are unset (unchanged Linux/Docker/dev behavior)', () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(
      process,
      'platform',
    );
    Object.defineProperty(process, 'platform', { value: 'linux' });
    const originalCwd = process.cwd();
    process.chdir(tmpRoot);
    try {
      expect(getInstallDir()).toBe(tmpRoot);
      expect(getDataDir()).toBe(tmpRoot);
      expect(getClientDir()).toBe(path.join(tmpRoot, 'client'));
    } finally {
      process.chdir(originalCwd);
      if (originalPlatform)
        Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('falls back to __dirname-relative install dir + fixed ProgramData data dir on win32 when the env vars are unset (WinSW can fail to pass its <env> elements through - confirmed on a real install)', () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(
      process,
      'platform',
    );
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      // Not a hardcoded path: this test file sits next to app-paths.ts, so
      // the same __dirname-relative computation (dist/src/config -> dist/src
      // -> dist -> <installDir> in production) holds here too, proving the
      // fallback tracks wherever the app actually lives instead of assuming
      // the default C:\Program Files\Taskmaster install location - that
      // assumption previously broke every custom-install-directory
      // deployment (e.g. D:\Taskmaster) with the exact EPERM this fallback
      // exists to prevent.
      expect(getInstallDir()).toBe(path.resolve(__dirname, '..', '..', '..'));
      expect(getDataDir()).toBe('C:\\ProgramData\\Taskmaster');
    } finally {
      if (originalPlatform)
        Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  it('honors TASKMASTER_INSTALL_DIR / TASKMASTER_DATA_DIR when set, including paths with spaces', () => {
    const installDir = path.join(tmpRoot, 'Program Files', 'Taskmaster', 'app');
    const dataDir = path.join(tmpRoot, 'ProgramData', 'Taskmaster');
    process.env.TASKMASTER_INSTALL_DIR = installDir;
    process.env.TASKMASTER_DATA_DIR = dataDir;

    expect(getInstallDir()).toBe(installDir);
    expect(getDataDir()).toBe(dataDir);
    expect(getClientDir()).toBe(path.join(installDir, 'client'));
    expect(getAppPackageJsonPath()).toBe(path.join(installDir, 'package.json'));

    const uploadsDir = getUploadsDir();
    expect(uploadsDir).toBe(path.join(dataDir, 'public', 'uploads'));
    expect(fs.existsSync(uploadsDir)).toBe(true);

    const logsDir = getLogsDir();
    expect(logsDir).toBe(path.join(dataDir, 'logs'));
    expect(fs.existsSync(logsDir)).toBe(true);
  });

  it('PROCEDURE_STORAGE_PATH override wins over the TASKMASTER_DATA_DIR default', () => {
    process.env.TASKMASTER_DATA_DIR = tmpRoot;
    const overrideDir = path.join(tmpRoot, 'custom-procedures');
    process.env.PROCEDURE_STORAGE_PATH = overrideDir;

    expect(getProcedureStorageDir()).toBe(overrideDir);
    expect(fs.existsSync(overrideDir)).toBe(true);
  });

  it('resolveDataPath resolves relative paths against the data dir but passes absolute paths through unchanged', () => {
    process.env.TASKMASTER_DATA_DIR = tmpRoot;

    expect(resolveDataPath('backups/system')).toBe(
      path.join(tmpRoot, 'backups', 'system'),
    );

    const absoluteElsewhere = path.join(os.tmpdir(), 'elsewhere');
    expect(resolveDataPath(absoluteElsewhere)).toBe(absoluteElsewhere);
  });

  describe('getPgBinaryPath', () => {
    let originalPlatform: PropertyDescriptor | undefined;

    beforeEach(() => {
      originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    });

    afterEach(() => {
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
    });

    it('appends .exe and joins with PG_BIN_PATH on win32', () => {
      process.env.PG_BIN_PATH = 'C:\\Program Files\\PostgreSQL\\17\\bin';
      Object.defineProperty(process, 'platform', { value: 'win32' });

      expect(getPgBinaryPath('pg_dump')).toBe(
        path.join('C:\\Program Files\\PostgreSQL\\17\\bin', 'pg_dump.exe'),
      );
    });

    it('does not append .exe on non-Windows platforms', () => {
      process.env.PG_BIN_PATH = '/opt/postgresql/17/bin';
      Object.defineProperty(process, 'platform', { value: 'linux' });

      // Uses the ambient `path.join` (native to whichever OS actually runs this
      // test), so the assertion mirrors the code under test instead of hardcoding
      // a POSIX separator that would fail when this suite runs on Windows.
      expect(getPgBinaryPath('pg_dump')).toBe(
        path.join('/opt/postgresql/17/bin', 'pg_dump'),
      );
    });

    it('falls back to a bare binary name (PATH lookup) when PG_BIN_PATH is unset', () => {
      delete process.env.PG_BIN_PATH;
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(getPgBinaryPath('pg_restore')).toBe('pg_restore');
    });
  });

  describe('Windows path semantics (path.win32) — the assumptions app-paths.ts relies on at runtime on Windows', () => {
    it('treats drive-letter paths, including ones with spaces, as absolute', () => {
      expect(win32Path.isAbsolute('C:\\Program Files\\Taskmaster\\app')).toBe(
        true,
      );
      expect(
        win32Path.isAbsolute('C:\\ProgramData\\Taskmaster\\config\\.env'),
      ).toBe(true);
    });

    it('joins Windows-style segments (including spaces) as expected', () => {
      expect(
        win32Path.join('C:\\Program Files\\Taskmaster\\app', 'client'),
      ).toBe('C:\\Program Files\\Taskmaster\\app\\client');
    });
  });
});
