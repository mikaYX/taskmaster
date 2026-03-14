#!/bin/bash
set -e

echo "Starting update process..."

# Assure environment variables
if [ -f .env ]; then
  export $(cat .env | xargs)
fi

echo "Secure backup of the database before updating..."
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="backup_db_${TIMESTAMP}.sql"

# Check if postgres is running
if docker compose -f docker-compose.prod.yml ps | grep -q "postgres.*\bUp\b"; then
  docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U ${POSTGRES_USER:-postgres} ${POSTGRES_DB:-taskmaster} > "$BACKUP_FILE"
  echo "Backup successfully saved to $BACKUP_FILE"
else
  echo "--!> Postgres container is not running. Assuming first installation or cold start. Skipping backup..."
fi

echo "Pulling latest changes..."
git pull || true

echo "Building and restarting containers..."
docker compose -f docker-compose.prod.yml up -d --build

echo "Update sequence complete. Migration container should run automatically."
