# Windows Server installation (without Docker)

Taskmaster installs on Windows Server 2019 x64 or later as a Windows service, from `Taskmaster-<version>-x64.msi`. Docker, WSL, Git and a global Node.js are not needed: the MSI ships its own Node.js 24 runtime.

## Prerequisites

- Windows Server 2019 x64 or later, with administrator rights.
- **PostgreSQL**, installed beforehand on this server or another one. Version 18 matches the Docker stack.
- **A Redis-compatible server**, installed beforehand: Redis, or [Memurai](https://www.memurai.com) on Windows.
- **The PostgreSQL client tools** (`pg_dump.exe`, `pg_restore.exe`) on this server, same major version as the database, for backups.

## Install

Run the MSI. The configuration dialog asks for:

| Field | Default | Silent-install property |
| --- | --- | --- |
| Application port | `3000` | `TASKMASTER_PORT` |
| PostgreSQL host, port, database | `localhost`, `5432`, `taskmaster` | `POSTGRES_DB_HOST`, `POSTGRES_DB_PORT`, `POSTGRES_DB_NAME` |
| PostgreSQL user and password | `taskmaster` | `POSTGRES_DB_USER`, `POSTGRES_DB_PASSWORD` |
| PostgreSQL admin user and password (optional) | `postgres` | `POSTGRES_ADMIN_USER`, `POSTGRES_ADMIN_PASSWORD` |
| Redis host, port | `localhost`, `6379` | `REDIS_DB_HOST`, `REDIS_DB_PORT` |
| PostgreSQL `bin` folder | Detected | `POSTGRES_BIN_PATH` |
| Public URL (optional) | | `TASKMASTER_PUBLIC_URL` |
| Offline mode | On | `TASKMASTER_OFFLINE_MODE` |
| Backup folder | `C:\ProgramData\Taskmaster\backups` | `TASKMASTER_BACKUP_PATH` |

**Database account.** With the admin credentials, the installer creates or updates the `taskmaster` role (without superuser rights) and its database. Without them, a DBA must create both beforehand. The admin credentials are only used during the installation and are never stored.

The installer then:
1. writes `C:\ProgramData\Taskmaster\config\.env`, with generated secrets;
2. applies the database migrations with the bundled Node.js;
3. registers the **Taskmaster** service (WinSW): delayed automatic start, restart on failure, running as `LocalSystem`;
4. checks `GET /api/health` and the web interface before reporting success, and writes `C:\ProgramData\Taskmaster\logs\install.log`;
5. adds a **Taskmaster** shortcut to the Start menu.

Open the shortcut and create the first administrator in the setup wizard.

Example of a silent installation:

```powershell
msiexec /i Taskmaster-1.2.0-x64.msi /qn `
  POSTGRES_DB_HOST=db01 POSTGRES_DB_PASSWORD="…" `
  POSTGRES_ADMIN_PASSWORD="…" `
  REDIS_DB_HOST=localhost `
  POSTGRES_BIN_PATH="C:\Program Files\PostgreSQL\18\bin" `
  TASKMASTER_PUBLIC_URL="https://taskmaster.example.com"
```

## Public URL and passkeys

Set **Public URL** when users open Taskmaster with another address than `http://localhost:3000`, for example `https://taskmaster.example.com`: scheme and host only, no path or parameters. URLs with credentials, a path or parameters are refused before anything is installed.

The URL fills `FRONTEND_URL`, `BACKEND_URL` and `CORS_ORIGIN` when the `.env` is first created, and the Start menu shortcut. It does not change the internal port and does not set up a reverse proxy or a TLS certificate. Taskmaster can also serve HTTPS itself with `TLS_CERT_FILE` and `TLS_KEY_FILE` (see [Configuration](configuration.md#server-and-urls)).

An update keeps the existing `.env`, even when another URL is given. To change the address of an installed server, see [Authentication → Passkeys](authentication.md#passkeys-need-a-stable-domain).

## Folders

```text
C:\Program Files\Taskmaster\
  app\            application files, replaced at every update
  runtime\node\   Node.js 24 runtime (the system PATH is not changed)
  service\        WinSW and the service definition

C:\ProgramData\Taskmaster\
  config\.env     configuration and secrets (readable by Administrators, SYSTEM and the service only)
  public\uploads\
  storage\procedures\
  storage\evidence\
  backups\
  logs\
```

`config\.env` is created once, at the first installation. A repair or an update never rewrites it.

The installation and data folders are recorded in `HKLM\SOFTWARE\Taskmaster` (`InstallDir`, `DataDir`). An update starts from the existing folders. To pick another data folder:

```powershell
msiexec /i Taskmaster-<version>-x64.msi TASKMASTERDATAROOT="D:\Taskmaster\data"
```

## Updates

Run the new MSI over the installed one. The update:
1. stops the service;
2. replaces the files under `Program Files`;
3. keeps `ProgramData` (configuration, uploads, procedures, evidence, backups) and the secrets;
4. applies the migrations and restarts the service.

Back up from Settings → Backup before updating. A repair (`msiexec /fa`) never touches `.env`.

To change a setting of an installed server, edit `C:\ProgramData\Taskmaster\config\.env`, then restart the service.

## Backups

- Archives go to `C:\ProgramData\Taskmaster\backups` by default, or to `TASKMASTER_BACKUP_PATH` (a local path or a UNC share, created and checked before installation).
- On an installed server, change `BACKUP_STORAGE_PATH` in `.env`. Existing archives are not moved: copy the `*.enc` files yourself.
- Backups run `pg_dump.exe` and `pg_restore.exe` from `PG_BIN_PATH`. Left empty, the newest version under `C:\Program Files\PostgreSQL` is used. When the database is on another server, install the client tools of the same major version here.
- The service runs as `LocalSystem`. For a network share, grant write access to the server's machine account (`DOMAIN\SERVER$`): drives mapped in a user session are not visible to the service.

More in [Troubleshooting](troubleshooting.md#a-backup-fails).

## Offline mode

The MSI writes `OFFLINE_MODE=true` by default: Taskmaster never calls GitHub to check for updates. SSO, SMTP and other integrations configured by an administrator still work.

To keep update checks, untick **Offline mode** in the dialog, or:

```powershell
msiexec /i Taskmaster-<version>-x64.msi TASKMASTER_OFFLINE_MODE=""
```

On an installed server, change `OFFLINE_MODE` in `.env` and restart the service. PDF export works offline: it needs no browser and no external resource.

## Uninstall

**Programs and Features**, or `msiexec /x`:
- removes the service, the `Program Files` folder and the shortcut;
- keeps `ProgramData`, PostgreSQL, Redis and the database.

`installer\purge\purge-full.ps1` removes everything, and must be run by hand:
- it deletes `ProgramData\Taskmaster`;
- it deletes a **local** database only after you confirm its name and location;
- it never deletes a database on another server.

## Build the MSI

On a Windows x64 build machine (the native Prisma and bcrypt binaries must be the Windows ones):

```powershell
cd installer
.\build.ps1          # add -Sign to sign the MSI with Authenticode
```

`build.ps1` runs:
1. `npm ci`, Prisma generation, typecheck, tests and lint;
2. the build and staging;
3. the download of Node.js and WinSW, verified by SHA-256;
4. the MSI build and the `SHA256SUMS` file.

The **Build Windows installer candidate** workflow does the same on GitHub Actions and uploads an unsigned test MSI.

## Test an installation

Follow the [Windows release checklist](windows-release-checklist.md) on a throwaway VM. After an installation or an update, run `installer\verify-installation.ps1`: it checks the service, the HTTP health, the PostgreSQL tools, the version and the kept configuration, without changing anything. `installer\test-public-url.ps1` checks the public URL validation, without installing anything.
