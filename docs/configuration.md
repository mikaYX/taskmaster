# Configuration

Taskmaster reads its configuration from environment variables, usually through a `.env` file:

| Installation | `.env` used |
| --- | --- |
| Docker Compose | `.env` next to `docker-compose.yml` (template: [`.env.docker.example`](../.env.docker.example)) |
| From source | `.env` at the repository root (template: [`.env.local.example`](../.env.local.example)) |
| Windows MSI | `C:\ProgramData\Taskmaster\config\.env` |

`TASKMASTER_ENV_FILE` points to another file. Restart the application after any change.

Most functional settings (sign-in methods, email, notifications, backups, branding) are not environment variables: administrators change them in **Settings**, and they are stored in the database. Sensitive values are encrypted there with AES-256-GCM.

## Required

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string. Built by Docker Compose from `POSTGRES_*`. |
| `AUTH_SECRET` | Signs the session tokens and derives the encryption key of sensitive settings. At least 32 characters. Changing it signs everyone out and makes encrypted settings unreadable. |
| `BOOTSTRAP_SECRET` | Must be set for the setup wizard to create the first administrator. At least 16 characters. Required when `NODE_ENV=production`. |
| `BACKUP_ENCRYPTION_KEY` | Encrypts and signs backups. Required when `NODE_ENV=production`. Keep a copy outside the server: a backup cannot be restored without it. |
| `CORS_ORIGIN` | Comma-separated origins allowed to call the API, for example `https://taskmaster.example.com`. Required when `NODE_ENV=production`. |

## Server and URLs

| Variable | Default | Description |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` enables the strict checks above and the production security headers. |
| `LOG_LEVEL` | `info` in production, `debug` otherwise | Log level: `silent`, `fatal`, `error`, `warn`, `info`, `debug` or `trace`. An unknown value stops the app at startup. |
| `PORT` | `3000` | HTTP port. |
| `FRONTEND_URL` | | Public address of the web interface. Used in links sent by email and as the default passkey domain. |
| `BACKEND_URL` | `http://localhost:3000` | Public address of the site, without `/api`. Used to build the SSO callback URLs (see [Authentication](authentication.md#public-urls)). |
| `TRUST_PROXY` | `loopback` | Proxies to trust for `X-Forwarded-For`, using the Express `trust proxy` syntax. Set `1` behind a single reverse proxy, so rate limiting and the audit log see the real client IP. |
| `TLS_CERT_FILE`, `TLS_KEY_FILE` | | Paths to a certificate and its key. When both are set, the server answers in HTTPS itself. |
| `RP_ID` | Domain of `FRONTEND_URL` | Passkey (WebAuthn) relying party ID. A domain only: no scheme, port or path. |
| `OFFLINE_MODE` | `false` | `true` disables the update checks against GitHub and Docker Hub. The Windows MSI overrides this to `true` on a fresh installation unless Offline mode is unticked; upgrades keep the existing `.env`. |

## Database and Redis

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_POOL_MAX` | `10` | Maximum PostgreSQL connections (1 to 100). |
| `DATABASE_STATEMENT_TIMEOUT_MS` | `0` | Maximum duration of one SQL statement. `0` means no limit. Keep it generous: exports run long queries. |
| `REDIS_URL` | `redis://redis:6379` | Redis connection, used for caching, job queues and sign-in lockouts. |
| `TASKMASTER_STARTUP_TIMEOUT_SECONDS` | `60` | How long the server waits for PostgreSQL and Redis at startup. |

The `POSTGRES_*`, `REDIS_PORT` and `*_CONTAINER_NAME` variables are only read by the Docker Compose files.

## Sessions and sign-in protection

| Variable | Default | Description |
| --- | --- | --- |
| `AUTH_GRACE_WINDOW_ENABLED` | `true` | Accepts a refresh token that was just rotated for a few seconds, so two tabs refreshing at once do not sign the user out. |
| `AUTH_GRACE_WINDOW_SECONDS` | `30` | Length of that window (1 to 60). The templates set 10. |
| `AUTH_LOCKOUT_IP_WHITELIST` | | Comma-separated IPs exempt from the per-IP sign-in lockout, for example a NAT gateway shared by many users. The per-account lockout still applies. |
| `OIDC_ALLOW_PRIVATE_IPS` | `false` | `true` lets the OIDC issuer resolve to a private IP, for a self-hosted identity provider on the internal network. |

The inactivity timeout is a setting, under Settings → Authentication. See [Authentication](authentication.md#sessions).

## Files and backups

| Variable | Default | Description |
| --- | --- | --- |
| `TASKMASTER_DATA_DIR` | Current folder (`C:\ProgramData\Taskmaster` on Windows) | Root of the writable data: uploads, procedures, photo evidence, backups. Relative paths below resolve against it. |
| `BACKUP_STORAGE_PATH` | `./backups` | Backup folder. Takes precedence over the folder set in Settings → Backup. |
| `BACKUP_DOCKER_CONTAINER` | | PostgreSQL container used to run `pg_dump` through `docker exec` when the host has no compatible client. |
| `PG_BIN_PATH` | | Folder holding `pg_dump` and `pg_restore`, for example `C:\Program Files\PostgreSQL\18\bin`. Without it they are looked up on the `PATH`. On Windows, the newest version under `C:\Program Files\PostgreSQL` is used. |
| `PROCEDURE_STORAGE_PATH` | `<data>/storage/procedures` | Folder for uploaded procedure files. |
| `PROCEDURE_MAX_SIZE_MB` | `5` | Maximum size of an uploaded procedure. |

## Privacy and retention

| Variable | Default | Description |
| --- | --- | --- |
| `IP_ANONYMIZATION_ENABLED` | `true` | IPs are anonymized before they are stored in the audit log and the session table. Set `false` only during a validated forensic investigation. See [Operations](operations.md#privacy-and-retention). |
| `AUDIT_LOG_RETENTION_DAYS` | `365` | Audit log entries older than this are deleted. `0` or less disables the cleanup. |
| `REFRESH_TOKEN_REVOKED_RETENTION_DAYS` | `90` | Revoked sessions older than this are deleted. |

## Push notifications

| Variable | Description |
| --- | --- |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Web Push keys (`npx web-push generate-vapid-keys`). Without them, Taskmaster generates a pair at first use and stores it in the database. |
| `VAPID_CONTACT` | Contact sent to push services, for example `mailto:admin@example.com`. |

## Observability

| Variable | Default | Description |
| --- | --- | --- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | | OTLP endpoint receiving OpenTelemetry traces. Traces are not exported without it. |
| `OTEL_TRACES_SAMPLER_ARG` | `1.0` | Share of traces kept, from 0 to 1. |
| `MEMORY_HEAP_THRESHOLD` | `536870912` (512 MB) | Heap size in bytes above which `/api/health` reports the memory check as failing. |

Prometheus metrics are served on `/api/metrics`, to local network addresses only.

## Update checks

| Variable | Description |
| --- | --- |
| `TASKMASTER_IMAGE` | Docker image used by Compose. When it is a Docker Hub image, update checks compare against its Docker Hub tags; otherwise against GitHub releases. |
| `VERSION_CHECK_REPO` | Forks only: GitHub repository (`owner/repository`) to compare against. |
| `VERSION_CHECK_DOCKER_IMAGE` | Forks only: Docker Hub image (`namespace/repository`) to compare against. |

See [Version updates](version-updates.md).

## Windows service

The MSI sets these variables. Change them only when moving an installation:

| Variable | Description |
| --- | --- |
| `TASKMASTER_INSTALL_DIR` | Application folder (contains `client/` and `dist/`). |
| `TASKMASTER_DATA_DIR` | Data folder, see above. |
| `TASKMASTER_ENV_FILE` | Path of the `.env` file. |
