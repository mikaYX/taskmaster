#!/usr/bin/env bash
# Mise à jour d'une installation Docker existante, PostgreSQL et Redis démarrés.
# Usage: ./scripts/update.sh [docker-compose.yml|docker-compose.build.yml]
# Compose lit le .env ; le script ne l'exécute pas comme du code shell.
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
umask 077

echo "Starting update process..."

if [ "$#" -gt 1 ]; then
  echo "Usage: $0 [docker-compose.yml|docker-compose.build.yml]" >&2
  exit 1
fi
if [ "$#" -eq 1 ]; then
  compose_file="$1"
elif [ -f docker-compose.yml ]; then
  compose_file="docker-compose.yml"
elif [ -f docker-compose.build.yml ]; then
  compose_file="docker-compose.build.yml"
else
  echo "ERROR: no docker-compose.yml or docker-compose.build.yml found in $(pwd)." >&2
  exit 1
fi
case "$compose_file" in
  docker-compose.yml|docker-compose.build.yml) ;;
  *) echo "ERROR: choose docker-compose.yml or docker-compose.build.yml." >&2; exit 1 ;;
esac
if [ ! -f "$compose_file" ]; then
  echo "ERROR: $compose_file does not exist." >&2
  exit 1
fi
echo "Using compose file: $compose_file"

docker compose version >/dev/null
running_services=$(docker compose -f "$compose_file" ps --status running --services)
for service in postgres redis; do
  if ! grep -Fxq "$service" <<< "$running_services"; then
    echo "ERROR: $service must already be running. Start the existing database/cache before updating." >&2
    exit 1
  fi
done

echo "Secure backup of the database before updating..."
mkdir -p backup/updates
backup_dir=$(mktemp -d "backup/updates/$(date +%Y%m%d_%H%M%S)_XXXXXX")
backup_file="$backup_dir/database.sql"
# Lire les identifiants dans le conteneur évite d'interpréter les secrets du .env.
if ! docker compose -f "$compose_file" exec -T postgres \
  sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$backup_file" || [ ! -s "$backup_file" ]; then
  rm -f "$backup_file"
  rmdir "$backup_dir"
  echo "ERROR: database backup failed; update aborted." >&2
  exit 1
fi
echo "Database backup saved to $backup_file (back up uploaded files separately)."

# Conserver les fichiers des anciens conteneurs avant d'ajouter leurs volumes.
app_container=$(docker compose -f "$compose_file" ps --all --quiet app)
if [ -n "$app_container" ]; then
  for directory in todo-attachments exports; do
    source_path="/app/$directory"
    if [ "$directory" = todo-attachments ]; then source_path="/app/storage/$directory"; fi
    if ! docker cp "$app_container:$source_path" "$backup_dir/$directory" 2>"$backup_dir/copy-error.log"; then
      if ! grep -Fq "Could not find the file $source_path in container" "$backup_dir/copy-error.log"; then
        cat "$backup_dir/copy-error.log" >&2
        echo "ERROR: could not preserve $source_path; update aborted. Database backup retained at $backup_file." >&2
        exit 1
      fi
    fi
  done
  rm -f "$backup_dir/copy-error.log"
fi

echo "Pulling latest changes..."
if ! git pull --ff-only; then
  echo "ERROR: 'git pull --ff-only' failed. Resolve the working tree state manually and re-run." >&2
  exit 1
fi

if [ "$compose_file" = docker-compose.build.yml ]; then
  echo "Building the app image..."
  docker compose -f "$compose_file" build --pull app
else
  echo "Pulling the app image..."
  docker compose -f "$compose_file" pull app
fi

echo "Preparing persistent storage and preserving existing Todo attachments/exports..."
restore_dirs=()
for directory in todo-attachments exports; do
  if [ -d "$backup_dir/$directory" ]; then restore_dirs+=("$directory"); fi
done
# Un flux tar fonctionne aussi avec un daemon Docker distant : aucun bind mount hôte.
tar -C "$backup_dir" -cf - -T /dev/null "${restore_dirs[@]}" | \
  docker compose -f "$compose_file" run --rm --no-deps -T app-storage \
  'mkdir -p /tmp/previous
   tar -xf - -C /tmp/previous
   for directory in todo-attachments exports; do
     if [ -d "/tmp/previous/$directory" ]; then
       for file in "/tmp/previous/$directory/"* "/tmp/previous/$directory/".[!.]* "/tmp/previous/$directory/"..?*; do
         if [ -e "$file" ] || [ -L "$file" ]; then
           cp -an "$file" "/data/$directory/"
         fi
       done
     fi
   done
   chown -R 1000:1000 /data/todo-attachments /data/exports'

echo "Restarting the app and waiting for migrations and health checks..."
if ! docker compose -f "$compose_file" up -d --no-deps --wait --wait-timeout 180 app; then
  docker compose -f "$compose_file" logs --tail=100 app >&2 || true
  echo "ERROR: app update failed. Database backup retained at $backup_file; no automatic rollback was attempted." >&2
  exit 1
fi

echo "Update complete: the app is healthy. Prisma migrations run inside the app container before the API starts."

