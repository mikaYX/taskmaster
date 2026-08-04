#!/usr/bin/env bash
# Mise à jour d'une installation Taskmaster (Docker).
# - charge proprement le .env (gère valeurs avec espaces / quotes contrairement à `cat | xargs`)
# - détecte le fichier docker compose disponible (docker-compose.yml standard,
#   docker-compose.build.yml pour builds locaux ; docker-compose.prod.yml a été
#   retiré du dépôt -- la doc le mentionnait encore par inertie)
# - dump la base avant `git pull` pour pouvoir restaurer en cas de souci
# - n'avale plus silencieusement les erreurs `git pull`
set -euo pipefail

echo "Starting update process..."

# Chargement sécurisé des variables d'environnement (gère "VAR=valeur avec espaces")
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

# Détection du fichier docker compose à utiliser
if [ -f docker-compose.yml ]; then
  COMPOSE_FILE="docker-compose.yml"
elif [ -f docker-compose.build.yml ]; then
  COMPOSE_FILE="docker-compose.build.yml"
else
  echo "ERROR: no docker-compose.yml or docker-compose.build.yml found in $(pwd)." >&2
  exit 1
fi
echo "Using compose file: ${COMPOSE_FILE}"

echo "Secure backup of the database before updating..."
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="backup_db_${TIMESTAMP}.sql"

# Check if postgres is running
if docker compose -f "${COMPOSE_FILE}" ps --status running --services 2>/dev/null | grep -q '^postgres$'; then
  docker compose -f "${COMPOSE_FILE}" exec -T postgres \
    pg_dump -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DB:-taskmaster}" > "$BACKUP_FILE"
  echo "Backup successfully saved to $BACKUP_FILE"
else
  echo "--!> Postgres container is not running. Assuming first installation or cold start. Skipping backup..."
fi

echo "Pulling latest changes..."
if ! git pull --ff-only; then
  echo "ERROR: 'git pull --ff-only' failed. Resolve the working tree state manually and re-run." >&2
  exit 1
fi

echo "Building and restarting containers..."
docker compose -f "${COMPOSE_FILE}" up -d --build

echo "Update sequence complete. Migration container should run automatically."

