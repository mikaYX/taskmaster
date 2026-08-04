import { existsSync, mkdirSync } from 'fs';
import { isAbsolute, join, resolve } from 'path';

/**
 * Centralized filesystem path resolution.
 *
 * Everything here used to be scattered `process.cwd()`-relative paths, which
 * only works when the process is launched with the "right" working directory
 * (true in Docker/dev, not guaranteed for a Windows Service). TASKMASTER_INSTALL_DIR
 * and TASKMASTER_DATA_DIR let a service wrapper (WinSW, systemd, etc.) pin both
 * roots explicitly; when unset, everything still resolves against process.cwd()
 * exactly as before, so Linux/Docker/dev behavior is unchanged.
 */

// Fallback ONLY for win32: WinSW's <env> elements have been observed to
// silently fail to reach the child node.exe process on a real install
// (root cause unconfirmed - reproduced manually launching node.exe with the
// same env vars set directly, which worked fine). process.cwd() falling
// back to <workingdirectory> (the install dir, read-only for the
// LocalService account) then breaks every write (e.g. EPERM creating
// backups/temp_uploads). Linux/Docker/dev behavior (process.cwd() fallback)
// is unchanged.
//
// getInstallDir()'s fallback resolves from __dirname rather than a
// hardcoded absolute path - this compiled file always lives at
// <installDir>/dist/src/config, regardless of where the admin chose to
// install (C:\Program Files\Taskmaster, D:\Taskmaster, ...). An earlier
// version of this fallback hardcoded 'C:\Program Files\Taskmaster\app',
// which broke every custom-install-directory deployment via the exact same
// symptom (EPERM under C:\Program Files) that this fallback exists to
// fix in the first place - confirmed on a real install to D:\Taskmaster.
// getDataDir()'s fallback stays a fixed ProgramData path: unlike the install
// directory, TASKMASTERDATAROOT is not admin-choosable (always
// CommonAppDataFolder - see installer/wix/Product.wxs), so hardcoding it
// here is correct, not a repeat of the same mistake.
const WIN32_DATA_DIR_FALLBACK = 'C:\\ProgramData\\Taskmaster';

export function getInstallDir(): string {
  if (process.env.TASKMASTER_INSTALL_DIR)
    return process.env.TASKMASTER_INSTALL_DIR;
  // dist/src/config -> dist/src -> dist -> <installDir>
  return process.platform === 'win32'
    ? resolve(__dirname, '..', '..', '..')
    : process.cwd();
}

export function getDataDir(): string {
  if (process.env.TASKMASTER_DATA_DIR) return process.env.TASKMASTER_DATA_DIR;
  return process.platform === 'win32' ? WIN32_DATA_DIR_FALLBACK : process.cwd();
}

export function ensureDir(dir: string): string {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Resolves a possibly-relative path against the data root (absolute paths pass through unchanged). */
export function resolveDataPath(rawPath: string): string {
  return isAbsolute(rawPath) ? rawPath : resolve(getDataDir(), rawPath);
}

/** Where the built frontend (`frontend/dist` copied to `client/`) ships alongside the app. */
export function getClientDir(): string {
  return join(getInstallDir(), 'client');
}

/** Where the app's own package.json lives, for version lookups. */
export function getAppPackageJsonPath(): string {
  return join(getInstallDir(), 'package.json');
}

export function getPublicDir(): string {
  return ensureDir(join(getDataDir(), 'public'));
}

export function getUploadsDir(): string {
  return ensureDir(join(getDataDir(), 'public', 'uploads'));
}

export function getProcedureStorageDir(): string {
  const override = process.env.PROCEDURE_STORAGE_PATH;
  const dir = override
    ? resolveDataPath(override)
    : join(getDataDir(), 'storage', 'procedures');
  return ensureDir(dir);
}

/** Default backup directory (env/DB-setting overrides are layered on top by BackupLogicService). */
export function getBackupSystemDir(): string {
  return join(getDataDir(), 'backups', 'system');
}

export function getBackupTempUploadsDir(): string {
  return ensureDir(join(getDataDir(), 'backups', 'temp_uploads'));
}

export function getBackupExportsDir(): string {
  return ensureDir(join(getDataDir(), 'backups', 'exports'));
}

export function getLogsDir(): string {
  return ensureDir(join(getDataDir(), 'logs'));
}

/**
 * Absolute path to a PostgreSQL client binary. Honors PG_BIN_PATH (set by the
 * Windows installer to PostgreSQL's own `bin\` directory); when unset, returns
 * just the binary name so it resolves via PATH (existing Linux/Docker/dev behavior).
 */
export function getPgBinaryPath(binaryName: 'pg_dump' | 'pg_restore'): string {
  const binDir = process.env.PG_BIN_PATH;
  const exeName =
    process.platform === 'win32' ? `${binaryName}.exe` : binaryName;
  return binDir ? join(binDir, exeName) : exeName;
}
