#!/bin/sh
set -eu
cd /app

if [ "$(id -u)" = "0" ]; then
  echo "[entrypoint] ERROR: refusing to run the application as root."
  exit 1
fi

# Migrations et app en tant qu'utilisateur non-root.
if [ -x ./node_modules/.bin/prisma ]; then
  echo "[entrypoint] Running Prisma migrate deploy..."
  if ! ./node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma; then
    echo "[entrypoint] ERROR: Prisma migrate deploy failed. Check DATABASE_URL and that the database is reachable."
    exit 1
  fi
  echo "[entrypoint] Prisma migrations applied."
else
  echo "[entrypoint] WARNING: Prisma CLI not found; skipping migrations."
fi

exec node dist/src/main
