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

`OFFLINE_MODE=true` turns the check off. The Windows MSI enables it by default.

`VERSION_CHECK_REPO` (`owner/repository`) and `VERSION_CHECK_DOCKER_IMAGE` (`namespace/repository`) are only for forks: they point the check to your own repository.

## Update a Docker installation

1. Back up the database (Settings → Backup, or see [Operations](operations.md#back-up-the-database)).
2. To pin a version, set it in `.env`, for example `TASKMASTER_IMAGE=mikaxy/taskmaster:1.2.0`. With `latest`, skip this step.
3. Pull the image and recreate the app container:

   ```bash
   docker compose pull app
   docker compose up -d app
   docker compose logs --tail=100 app
   ```

The container applies the new migrations when it starts. Pre-release versions (`1.2.0-beta.1`…) are published under the `beta` tag, never as `latest`.

## Update an installation from source

```bash
git pull
npm install
cd backend && npx prisma migrate deploy && cd ..
npm run build
```

Then restart the process: `npm run dev` in development, or your service manager (systemd, pm2…) in production.

## Update a Windows installation

Run the new MSI over the existing one. The update:
- keeps `C:\ProgramData\Taskmaster` (configuration, uploads, procedures, backups);
- applies the migrations and restarts the service.

See the [Windows Server guide](windows-server-2019-local.md#updates).

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
