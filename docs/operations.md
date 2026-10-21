# Operations

Running Taskmaster in production with [`docker-compose.yml`](../docker-compose.yml): deploy, update, back up, restore and monitor. Run the commands from the folder that holds `docker-compose.yml` and `.env`.

The stack has three long-running services and a storage initialization job:

| Service | Default container | Role |
| --- | --- | --- |
| `app` | `taskmaster_app` | API and web interface; applies the migrations at startup |
| `postgres` | `taskmaster_db` | PostgreSQL 18 |
| `redis` | `taskmaster_redis` | Redis 8: cache, job queues, sign-in lockouts |
| `app-storage` | Compose-generated | Runs once as root to give the app user ownership of the Todo attachment and export volumes, then exits |

Data lives in named volumes:

| Volume | Content |
| --- | --- |
| `postgres_data` | Database |
| `redis_data` | Redis |
| `app_backups` | Backups |
| `app_uploads` | Uploaded images |
| `app_procedures` | Procedure files |
| `app_evidence` | Photo evidence |
| `app_todo_attachments` | Todo attachments |
| `app_exports` | Generated CSV/PDF exports at the default export path |

## Deploy

```bash
docker compose pull app app-storage
docker compose up -d
docker compose ps
```

Before the first start, set at least `POSTGRES_PASSWORD`, `AUTH_SECRET`, `BOOTSTRAP_SECRET`, `BACKUP_ENCRYPTION_KEY`, `CORS_ORIGIN` and `TASKMASTER_IMAGE` in `.env`. See [Getting started](getting-started.md#run-with-docker).

Behind a reverse proxy (nginx, Traefik…):
- forward everything to port 3000: the app serves both `/api` and the web interface;
- set `TRUST_PROXY=1`, so rate limiting and the audit log see the real client IP;
- set the public HTTPS address in `CORS_ORIGIN`, `FRONTEND_URL` and `BACKEND_URL`.

## Update and roll back

See [Version updates](version-updates.md). Always back up first.

Migrations only move forward. Rolling back to an older image after a migration is not supported: restore the backup taken before the update instead.

## Back up the database

**From the application.** In **Settings → Backup**, a super admin can:
- create, schedule, download, validate and restore backups;
- choose a **DB** backup (database only) or a **FULL** one (database plus uploads, procedures and photo evidence).

Archives are encrypted with AES-256-GCM and signed with `BACKUP_ENCRYPTION_KEY`. Taskmaster refuses to restore an altered or unsigned archive. Keep the key outside the server: it is never stored in the archive, and the `.env` secrets are not backed up either.

**By hand,** with `pg_dump` in the database container:

```bash
docker exec taskmaster_db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "taskmaster_$(date +%Y%m%d_%H%M%S).sql"
```

A database dump does not contain the files (uploads, procedures, photos). Back up the `app_*` volumes as well, or use a FULL backup.

## Restore a manual dump

1. Stop the app, so nothing writes during the restore.
2. Reset the schema.
3. Load the dump.
4. Start the app again.

```bash
docker stop taskmaster_app
docker exec taskmaster_db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"'
docker exec -i taskmaster_db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < taskmaster_YYYYMMDD_HHMMSS.sql
docker start taskmaster_app
```

> [!CAUTION]
> This replaces all the data. Test it on a throwaway instance first.

## Monitor

| What | How |
| --- | --- |
| Health | `curl http://localhost:3000/api/health` checks the database, Redis and the memory heap. The image also has a Docker `HEALTHCHECK` on it. |
| Logs | `docker compose logs -f --tail=100 app` (JSON, via Pino) |
| Metrics | Prometheus format on `/api/metrics`, from local network addresses only |
| Traces | OpenTelemetry, exported when `OTEL_EXPORTER_OTLP_ENDPOINT` is set |
| Resources | `docker stats` |

Check after a deployment:
- `docker compose ps --all` shows the three long-running services as healthy. When started by `up`, `app-storage` exits successfully; the update script instead runs it with `run --rm`, which removes the completed job container;
- `/api/health` answers `200`;
- the app log shows no Prisma or Redis error at startup.

## Privacy and retention

Taskmaster anonymizes IP addresses before storing them in the audit log (`audit_logs.ip_address`) and the session table (`refresh_tokens.ip_address`):

| Input | Stored as |
| --- | --- |
| IPv4 | Last byte masked: `192.168.1.42` becomes `192.168.1.0` |
| IPv6 | First 48 bits kept: `2001:db8:abcd::1` becomes `2001:db8:abcd::` |
| `unknown` | Kept as is |
| Malformed value | Not stored |

Anonymization is on by default. `IP_ANONYMIZATION_ENABLED=false` exists only for a validated forensic investigation window: remove it afterwards. It applies to new records only, and existing rows are left unchanged. Back-filling older rows reduces what past investigations can use, so it is a decision for your data protection officer.

Retention jobs delete old data progressively:

| Variable | Default | Data |
| --- | --- | --- |
| `AUDIT_LOG_RETENTION_DAYS` | 365 | Audit log |
| `REFRESH_TOKEN_REVOKED_RETENTION_DAYS` | 90 | Revoked sessions |

After changing a retention or anonymization policy:
- check the `cleanup-audit-logs` and `cleanup-refresh-tokens` lines in the log;
- record the decision in your record of processing activities.

## See also

- [Configuration](configuration.md)
- [Troubleshooting](troubleshooting.md)
- [Docker build](docker-build.md)
