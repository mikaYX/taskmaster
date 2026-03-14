#!/bin/sh
set -e
cd /app

# Installation des dépendances (une seule fois par volume node_modules)
# Doit tourner en root pour écrire dans le volume node_modules (sinon EACCES).
if [ ! -d ./node_modules ] || [ ! -f ./node_modules/.install-complete ]; then
  if [ "$(id -u)" != "0" ]; then
    echo "[entrypoint] ERROR: Must run as root to install node_modules. Rebuild the image and ensure no 'user:' override forces node."
    exit 1
  fi
  echo "[entrypoint] Installing Node.js dependencies (production)..."
  # --ignore-scripts : pas de postinstall (scripts/prisma-generate.js absent de l'image)
  npm install --omit=dev --legacy-peer-deps --ignore-scripts

  echo "[entrypoint] Installing Prisma CLI..."
  npm install prisma --no-save --ignore-scripts

  if [ -f ./prisma/schema.prisma ]; then
    echo "[entrypoint] Generating Prisma client..."
    npx prisma generate --schema=./prisma/schema.prisma || {
      echo "[entrypoint] WARNING: prisma generate failed. Continuing without regenerated client."
    }
  fi

  touch ./node_modules/.install-complete
  chown -R node:node /app/node_modules
  echo "[entrypoint] Dependencies installation completed."
fi

# Migrations et app en tant que node (su-exec drop root)
if [ -x ./node_modules/.bin/prisma ]; then
  echo "[entrypoint] Running Prisma migrate deploy..."
  if ! su-exec node ./node_modules/.bin/prisma migrate deploy --schema=./prisma/schema.prisma; then
    echo "[entrypoint] ERROR: Prisma migrate deploy failed. Check DATABASE_URL and that the database is reachable."
    exit 1
  fi
  echo "[entrypoint] Prisma migrations applied."
fi

exec su-exec node node dist/src/main
