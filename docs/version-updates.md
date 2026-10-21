# Version updates

How Taskmaster detects new versions, how to update each kind of installation, and what to check when the update check fails.

## How the check works

**Settings → Updates** shows the current version and the latest one available. Behind it:
- `GET /api/system/version` returns the check result, for super admins and managers;
- **Refresh** calls `POST /api/system/version/refresh` to check again without waiting for the cache;
- a successful check is cached for 15 minutes, a failed one for 5.

The source depends on how Taskmaster is deployed:

| Deployment | Compared with |
| --- | --- |
| From source, or Windows MSI | GitHub releases of `mikaYX/taskmaster`. If the releases API fails, the `package.json` of the `main` branch. |
| Docker, with `TASKMASTER_IMAGE` on Docker Hub (for example `mikaxy/taskmaster:latest`) | Docker Hub tags of that image |
| Docker, with a local or private image (for example `taskmaster:secure-local`) | GitHub releases |

`OFFLINE_MODE=true` turns the check off. The application defaults to `false`, but the Windows MSI checks **Offline mode** by default on a fresh installation and writes `true`. Untick it during installation, or set `OFFLINE_MODE=false` in the installed `.env` and restart the service, to enable checks. An MSI upgrade preserves the existing setting.

`VERSION_CHECK_REPO` (`owner/repository`) and `VERSION_CHECK_DOCKER_IMAGE` (`namespace/repository`) are only for forks: they point the check to your own repository.

## Update a Docker installation

When first adding the Todo attachment/export volumes to an existing installation, copy `/app/storage/todo-attachments` and `/app/exports` out of the old app container **before recreating it**, then restore any existing files into `app_todo_attachments` and `app_exports`. A new empty volume does not recover files from a replaced container. For a Git checkout, the update script below automates this transfer. `app-storage` initializes ownership for the non-root app user, including when using the published 1.2.0 image.

1. Back up the database (Settings → Backup, or see [Operations](operations.md#back-up-the-database)).
2. To pin a version, set it in `.env`, for example `TASKMASTER_IMAGE=mikaxy/taskmaster:1.2.0`. With `latest`, skip this step.
3. With PostgreSQL and Redis already running, pull the image and recreate only the app container:

   ```bash
   docker compose pull app
   docker compose run --rm --no-deps -T app-storage
   docker compose up -d --no-deps app
   docker compose logs --tail=100 app
   docker compose ps app
   ```

The official image contains the Prisma client generated at build time, the Prisma CLI and the SQL migrations for that version. At every startup, its entrypoint runs `prisma migrate deploy` **before starting the API**. Prisma records completed migrations in `_prisma_migrations` and applies only pending ones; restarting the same version does not apply them again. No manual `prisma generate`, `migrate dev` or `db push` is needed on the Docker host.

For an upgrade from 1.1.10 to 1.2.0, the new migrations are `20261021000000_todolist_v2`, `20261021010000_todo_reminder_email_opt_in` and `20261021020000_task_delegation_indexes`. They keep existing tasks and todos; email reminders become opt-in, so each person must enable them in the Todo reminder preferences. An upgrade from a beta applies only the migrations it has not already received.

If a migration fails, the entrypoint exits without starting the API. Read `docker compose logs app`, correct the cause and resolve any failed migration before retrying. There is no automatic database rollback; see [Operations](operations.md#update-and-roll-back). Successful startup logs include `Prisma migrations applied.`; check that the app becomes healthy as well.

Keep the existing `.env`, Compose project name and named volumes. Do not run `docker compose down -v`: it deletes the stack's volumes. An application update does not upgrade an existing PostgreSQL data directory to another major version; handle a PostgreSQL major upgrade separately.

For a Git checkout, `./scripts/update.sh` automates the Docker update: it requires PostgreSQL and Redis to be running, saves a SQL database dump under `backup/updates/`, copies existing Todo attachments and exports out of the old app container, runs `git pull --ff-only`, pulls the app image and prepares its storage volumes. Existing attachment/export files are copied into those volumes without replacing files already there. It then recreates only the app, waiting up to 180 seconds for health checks. It stops on a failed backup, copy, pull, initialization or startup and retains the completed database dump. Back up other uploaded files separately, or take a FULL backup from the application first. It requires Docker Compose v2 with `up --wait` support.

For a local build, use `./scripts/update.sh docker-compose.build.yml`: it builds the app image with `--pull` instead of downloading the published app image. The default is `docker-compose.yml` when both files exist. Both modes keep PostgreSQL and Redis containers running.

Pre-release versions (`1.2.0-beta.1`…) are published under the `beta` tag, never as `latest`.

## Update an installation from source

```bash
git pull --ff-only
npm ci --include=dev
node --env-file=.env node_modules/prisma/build/index.js migrate deploy --config=backend/prisma.config.cjs
npm run build
```

Back up the database and uploaded files before updating. On Windows, `scripts\update.bat` first runs `scripts\backup-database.cjs`, before `git pull` or dependency installation. The helper uses only Node built-ins, loads `.env` and `backend/.env` (already-exported variables win), and writes a PostgreSQL custom-format `database.dump` under `backup/updates/`. It requires `pg_dump` in `PG_BIN_PATH`, on the PATH, or in a detected Windows PostgreSQL installation. Use client tools matching the database major version. The password is passed through the child environment, not command arguments. On Windows the backup folder ACL allows only the current user, Administrators and SYSTEM; on Linux the directory/file modes are `0700`/`0600`. A failed or invalid dump stops the update and its incomplete files are removed. Restore a custom-format dump with `pg_restore`, not `psql`.

The batch script then runs the source update from the repository root, stops at the first error and returns a nonzero exit code. The root `npm ci` generates the Prisma client through the existing postinstall scripts. For migration deployment, Node loads `.env` and then `backend/.env` when present (the latter takes precedence between files; already-exported variables still win), since Prisma 7 does not load them automatically. This script is for a source installation; update an MSI installation with the new MSI.

### Existing development databases on PostgreSQL 18

`docker-compose.local-db.yml` now explicitly sets `PGDATA=/var/lib/postgresql/data` so that the database uses the named `postgres_local_data` volume, matching the other Compose files. An older local stack without this setting may have written its real database to PostgreSQL 18's default `/var/lib/postgresql/18/docker` in an anonymous volume. Before recreating that PostgreSQL container, inspect its `PGDATA` and mounts, dump the database while it is running, and restore the dump into the corrected stack if the paths differ. Keep the old container/volume until the restore is verified; the file change does not move existing database files automatically. The update scripts do not recreate PostgreSQL.

Then restart the process: `npm run dev` in development, or your service manager (systemd, pm2…) in production.

## Update a Windows installation

Run the new MSI over the existing one. The update:
- keeps `C:\ProgramData\Taskmaster` (configuration, uploads, procedures, backups);
- applies the migrations and restarts the service.

See the [Windows installation guide](windows-server-2019-local.md#updates).

## When the check fails

The interface shows `Check failed` or `Unable to check for updates`. The details are in the backend log. Look for:

- `GitHub Releases API failed`
- `GitHub package.json fallback failed`
- `Docker Hub tags API failed`
- `Ignoring invalid VERSION_CHECK_REPO value`
- `Ignoring invalid VERSION_CHECK_DOCKER_IMAGE value`

Then check:
- outbound HTTPS to `api.github.com`, `raw.githubusercontent.com` or `hub.docker.com` from the server;
- DNS resolution from the backend process;
- a corporate TLS proxy: when `curl` works but Node.js fails, Node.js may need the proxy CA (`NODE_EXTRA_CA_CERTS`);
- the effective `TASKMASTER_IMAGE` and fork overrides;
- that `OFFLINE_MODE` is not set to `true`.

From the server:

```bash
curl -I https://api.github.com/repos/mikaYX/taskmaster/releases/latest
curl -I "https://hub.docker.com/v2/namespaces/mikaxy/repositories/taskmaster/tags?page_size=10"
```

Logs: `docker compose logs -f app` for Docker; the terminal running the backend for a source installation; `C:\ProgramData\Taskmaster\logs` on Windows.
