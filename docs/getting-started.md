# Getting started

Three ways to run Taskmaster:

| Path | For | Section |
| --- | --- | --- |
| Docker Compose | Production or a quick trial | [Run with Docker](#run-with-docker) |
| Node.js from source | Development | [Run from source](#run-from-source) |
| Windows MSI | Windows 11 or later, or Windows Server 2019 or later (x64), without Docker | [Windows installation guide](windows-server-2019-local.md) |

Whichever path you choose, the first visit opens the setup wizard, which creates the first administrator. Taskmaster has no default account.

## Run with Docker

The stack in [`docker-compose.yml`](../docker-compose.yml) has three long-running services:
- `app`: the API and the web interface, in a single image;
- `postgres`: PostgreSQL 18;
- `redis`: Redis 8.

An additional `app-storage` job initializes ownership of the persistent Todo attachment and export volumes, then exits. The app waits for it to complete before starting.

Data is kept in named Docker volumes.

**Prerequisites:** Docker with Compose v2.

1. Create the configuration from the template:

   ```bash
   cp .env.docker.example .env
   ```

2. Edit `.env`. At least replace these values:

   | Variable | Value |
   | --- | --- |
   | `POSTGRES_PASSWORD` | A strong password |
   | `AUTH_SECRET` | At least 32 characters: `openssl rand -base64 32` |
   | `BOOTSTRAP_SECRET` | At least 16 characters: `openssl rand -base64 24` |
   | `BACKUP_ENCRYPTION_KEY` | At least 32 characters: `openssl rand -base64 32`. Keep a copy: you need it to restore a backup. |
   | `CORS_ORIGIN`, `FRONTEND_URL`, `BACKEND_URL` | The address users type in their browser, for example `https://taskmaster.example.com` |
   | `TASKMASTER_IMAGE` | `mikaxy/taskmaster:latest`, or a fixed version such as `mikaxy/taskmaster:1.2.0` |

3. Start the stack:

   ```bash
   docker compose up -d
   ```

   The `app` container applies the database migrations itself, then starts.

4. Open `http://localhost:3000` (or the `PORT` you set) and follow the setup wizard:
   - pick the interface language and the time zone: they become the instance defaults, and can be changed later in Settings;
   - choose whether the Todo module is enabled;
   - create the administrator account.

To check that the stack is healthy:

```bash
docker compose ps
curl http://localhost:3000/api/health
```

To build the image yourself instead of pulling it, see [Docker build](docker-build.md). Updates are covered in [Version updates](version-updates.md).

> [!WARNING]
> `docker compose down -v` deletes the volumes, and with them the database, uploads and backups.

## Run from source

**Prerequisites:**
- Node.js 22 to 24 and npm 10 or later;
- Docker, for the local PostgreSQL and Redis. Any PostgreSQL 18 and Redis also work.

1. Install the dependencies. The repository is an npm workspaces monorepo, so one install at the root covers the backend and the frontend:

   ```bash
   npm install
   ```

2. Create the configuration and start PostgreSQL and Redis:

   ```bash
   cp .env.local.example .env
   docker compose -f docker-compose.local-db.yml up -d
   ```

   [`docker-compose.local-db.yml`](../docker-compose.local-db.yml) only starts `postgres` (container `taskmaster_local_db`) and `redis` (container `taskmaster_local_redis`). The defaults in `.env.local.example` match it.

3. Apply the migrations:

   ```bash
   cd backend && npx prisma migrate deploy && cd ..
   ```

4. Start the backend and the frontend:

   ```bash
   npm run dev
   ```

   - Web interface: `http://localhost:5173`. The Vite dev server forwards `/api` to the backend.
   - API: `http://localhost:3000/api`.

5. Open `http://localhost:5173`, which redirects to the setup wizard.

### Useful commands

| Command | What it does |
| --- | --- |
| `npm run dev:backend` / `npm run dev:frontend` | Start only one side |
| `npm run build` | Build the backend and the frontend, then copy the frontend into `client/` so the backend serves it |
| `npm run lint` / `npm run typecheck` / `npm test` | Checks run by the CI |
| `npm run test:e2e` | End-to-end tests. They wipe data, so use a dedicated database (see [CONTRIBUTING.md](../CONTRIBUTING.md)) |
| `npm -w frontend run check:i18n` | Check that the English and French translations have the same keys |
| `npx prisma studio` (in `backend/`) | Browse the database |
| `npx prisma migrate dev` (in `backend/`) | Create a migration after changing `schema.prisma` |
| `npm run db:generate` | Regenerate the Prisma client |

### Run the production build without Docker

```bash
npm run build
NODE_ENV=production node backend/dist/src/main
```

Run it from the repository root. The backend reads the root `.env`, serves the web interface from `client/` and the API on the same port, and writes uploads and backups under the current folder (`TASKMASTER_DATA_DIR` changes it). In production, `CORS_ORIGIN`, `BACKUP_ENCRYPTION_KEY` and `BOOTSTRAP_SECRET` are required, and the backend refuses to start without them.

## After the first login

- **Users and groups**: Settings → Security.
- **Sites**: Settings → Sites. Every user and every task belongs to a site.
- **Sign-in methods** (LDAP, Azure AD, Google, OIDC, SAML, MFA, passkeys): Settings → Authentication. See [Authentication](authentication.md).
- **Email and notification channels**: Settings → Email and Settings → Notifications.
- **Backups**: Settings → Backup.
- **Wall screens**: Settings → Security → Guest TV Links creates a read-only link per site, for the task board or the analytics.

Every environment variable is listed in [Configuration](configuration.md).

## Common problems

| Symptom | Check |
| --- | --- |
| The app exits with `Environment validation failed` | `AUTH_SECRET` must be at least 32 characters and `BOOTSTRAP_SECRET` at least 16 |
| `Running in PRODUCTION requires: …` | Set the variables listed in the message |
| The setup wizard says `BOOTSTRAP_SECRET is missing` | Set `BOOTSTRAP_SECRET` in `.env` and restart |
| Users are signed out after a few minutes | `CORS_ORIGIN` and `FRONTEND_URL` must match the address typed in the browser. See [Troubleshooting](troubleshooting.md) |
| Migrations fail at startup | `DATABASE_URL` must point to a reachable database. Run `npx prisma migrate status` in `backend/` |

More in [Troubleshooting](troubleshooting.md).
