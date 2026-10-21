# Troubleshooting

Common problems and how to fix them. Docker commands assume the default container names (`taskmaster_app`, `taskmaster_db`, `taskmaster_redis`) and are run next to `docker-compose.yml`.

## The application does not start

Read the log first:

```bash
docker compose logs --tail=100 app
```

| Message | Fix |
| --- | --- |
| `Environment validation failed` | A variable is missing or too short: `AUTH_SECRET` needs 32 characters, `BOOTSTRAP_SECRET` 16. |
| `Running in PRODUCTION requires: …` | Set the variables listed (`CORS_ORIGIN`, `BACKUP_ENCRYPTION_KEY`, `BOOTSTRAP_SECRET`). |
| `Prisma migrate deploy failed` | The database is unreachable or a migration failed. See below. |
| `refusing to run the application as root` | The image must run as the `node` user. Do not override `user:` in Compose. |

## Database

```bash
docker compose ps postgres
docker compose logs --tail=100 postgres
docker compose exec app npx prisma migrate status
```

- If the database container is unhealthy, check the `postgres_data` volume and the free disk space.
- If `migrate status` reports a failed migration, read its error in the app log before doing anything.
- `npx prisma migrate resolve --applied <migration_name>` marks a migration as applied. Use it only once you have checked by hand that the database matches it.

## Redis

```bash
docker exec taskmaster_redis redis-cli ping
docker exec taskmaster_redis redis-cli info memory
```

While Redis is down, the app logs `Redis connection error` once and reconnects every 5 seconds at most. `Redis connection restored` confirms the reconnection.

## Too many `429 Too Many Requests`

- The API allows 60 requests per minute per IP, and less on the sign-in endpoints (see [Authentication](authentication.md#protection-against-brute-force)).
- Behind a reverse proxy, set `TRUST_PROXY=1`. Without it, every user shares the proxy IP and therefore the same limit.
- Users behind one NAT gateway can be exempted from the per-IP sign-in lockout with `AUTH_LOCKOUT_IP_WHITELIST`.

## CORS errors in the browser

`CORS_ORIGIN` must list the exact origin the browser shows: scheme, host and port, with no trailing `/`. Separate several origins with commas. Restart the app after changing it.

## Users are signed out every 15 minutes

The access token lasts 15 minutes. The browser renews it through `/api/auth/refresh`. If the renewal is refused (`403 CSRF validation failed`), the session is lost.

The renewal is accepted from:
- same-origin requests (`Sec-Fetch-Site` header);
- the address actually used to reach the server;
- `CORS_ORIGIN`, `FRONTEND_URL` and `BACKEND_URL`.

The log line `Request refused: origin … is not trusted` gives the refused origin. Add it, with `https://` and without a trailing `/`, to `CORS_ORIGIN` and `FRONTEND_URL`, then restart. Behind a reverse proxy, keep `TRUST_PROXY` set too.

The inactivity timeout itself is a setting: Settings → Authentication → *Sign out after inactivity* (5 to 1440 minutes, 30 by default).

## Passkeys fail with `'rp.id' cannot be used with the current origin`

The browser opened a different address than the configured domain. See [Authentication → Passkeys](authentication.md#passkeys-need-a-stable-domain).

## SSO redirects fail

Compare the callback URL registered at the provider with the one Taskmaster sends (see [Authentication → Public URLs](authentication.md#public-urls)). Both must match character for character, `http` versus `https` included, and both include `/api`. A URL registered without it, as 1.1 sent it, ends on the web app instead of the API.

## A backup fails

The backup dialog waits for the end of the job and shows its error. A job accepted in the queue is not a success: an archive only appears in the history once it is encrypted and signed. If you lost track of a job, check the history before starting another one.

| Cause | Fix |
| --- | --- |
| `pg_dump` missing or older than the server | Install the PostgreSQL client of the same major version, or set `PG_BIN_PATH`. With Docker, `BACKUP_DOCKER_CONTAINER` runs `pg_dump` inside the database container instead. |
| Backup folder not writable | The account running the app must be able to create, change and delete files in `BACKUP_STORAGE_PATH`. |
| Retention error | It is logged, but the new backup is kept. |

`BACKUP_STORAGE_PATH` takes precedence over the folder set in Settings → Backup, and the Backup screen shows the folder actually used.

FULL backups include the uploads and procedures (including a custom `PROCEDURE_STORAGE_PATH`) and the photo evidence. They never include the `.env` secrets: keep `BACKUP_ENCRYPTION_KEY` separately.

### On a Windows service

- Relative paths such as `./backups` are resolved from `TASKMASTER_DATA_DIR`, by default `C:\ProgramData\Taskmaster`.
- `PG_BIN_PATH` must point to the PostgreSQL `bin` folder, without quotes in the value, for example `C:\Program Files\PostgreSQL\18\bin`.
- For a network share, use a UNC path. Drives mapped in an administrator session are not visible to the service.
- The service runs as `LocalSystem`, so the share must grant write access to the server's machine account (`DOMAIN\SERVER$`).

Restart the service after any change.

## The password change dialog does not appear after a reset

Resetting a password from user management marks the account so the user must change it at the next sign-in.
1. The user signs in with the temporary password.
2. They type it again as **Current password** and choose a new one.

When both are required, the password change comes before the passkey enrollment. An already open session is checked again when the user comes back to the tab.

## A page reload returns 404

The app serves the web interface itself and answers every non-API path with `index.html`. A 404 on reload comes from a reverse proxy that does not forward everything to the app: forward `/` entirely, not only `/api`.
