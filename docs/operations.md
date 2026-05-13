# Guide d'exploitation de la production

Ce guide explique comment déployer, mettre à jour, superviser et restaurer l'environnement de production Taskmaster avec [`../docker-compose.yml`](../docker-compose.yml).

## Contexte

La stack Docker actuelle regroupe :

- `postgres`
- `redis`
- `app`

Le service `app` embarque l'API et le frontend dans une seule image. Par défaut, les exemples utilisent `--env-file .env` parce que ce fichier existe dans le dépôt. Si votre environnement utilise un autre fichier, remplacez simplement ce paramètre.

## Pré-requis

- Avoir Docker et Docker Compose v2 installés.
- Avoir un fichier [`../.env.docker.example`](../.env.docker.example) copié vers `../.env`.
- Avoir défini au minimum `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `AUTH_SECRET`, `BACKUP_ENCRYPTION_KEY`, `CORS_ORIGIN` et `TASKMASTER_IMAGE`.
- Exécuter les commandes depuis la racine du dépôt.

## Étapes

### Déployer la stack complète

1. Vérifiez la configuration d'environnement.
2. Récupérez l'image applicative attendue.
3. Démarrez les services.

```bash
docker compose --env-file .env pull app
docker compose --env-file .env up -d
docker compose --env-file .env ps
```

### Mettre à jour l'application

1. Sauvegardez la base avant toute mise à jour.
2. Mettez à jour `TASKMASTER_IMAGE` dans `.env` si vous ciblez un tag précis.
3. Récupérez la nouvelle image.
4. Redémarrez uniquement `app`.

```bash
docker compose --env-file .env pull app
docker compose --env-file .env up -d app
docker compose --env-file .env logs --tail=100 app
```

Taskmaster compare automatiquement la version courante au remote officiel correspondant au mode de déploiement : releases GitHub pour une installation source, tags Docker Hub pour une image Docker Hub. Les variables `VERSION_CHECK_REPO` et `VERSION_CHECK_DOCKER_IMAGE` sont réservées aux forks.

### Sauvegarder la base PostgreSQL

1. Créez un export SQL horodaté.
2. Vérifiez que le fichier généré a une taille cohérente.

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec -t taskmaster_db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "backup_db_${TIMESTAMP}.sql"
ls -lh "backup_db_${TIMESTAMP}.sql"
```

### Restaurer une sauvegarde SQL

1. Arrêtez temporairement l'application pour éviter les écritures concurrentes.
2. Réinitialisez le schéma si vous voulez une restauration propre.
3. Réinjectez le dump SQL.
4. Redémarrez `app`.

```bash
docker stop taskmaster_app
docker exec -i taskmaster_db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
cat backup_db_YYYYMMDD_HHMMSS.sql | docker exec -i taskmaster_db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
docker start taskmaster_app
```

### Consulter les logs et la consommation

```bash
docker compose --env-file .env logs -f
docker compose --env-file .env logs -f --tail=100 app
docker stats
```

### Appliquer un rollback applicatif

1. Pointez `TASKMASTER_IMAGE` vers le dernier tag stable connu.
2. Redéployez `app`.
3. Si nécessaire, restaurez la dernière sauvegarde compatible.

```bash
docker compose --env-file .env pull app
docker compose --env-file .env up -d app
```

## Vérifications

- `docker compose --env-file .env ps` montre `postgres`, `redis` et `app` actifs.
- `curl http://localhost:3000/api/health` renvoie un statut `200`.
- `docker compose --env-file .env logs --tail=100 app` ne montre ni erreur Prisma ni erreur Redis au démarrage.

## Ressources

- Compose principal : [`../docker-compose.yml`](../docker-compose.yml)
- Variables d'environnement : [`../.env.docker.example`](../.env.docker.example)
- Guide de dépannage : [`./troubleshooting.md`](./troubleshooting.md)
- Runbook incident : [`./incident_runbook.md`](./incident_runbook.md)

Notes :

- Les migrations Prisma restent exécutées par l'entrypoint de l'image `app`.
- En production, évitez les commandes destructrices hors fenêtre de maintenance validée.

## Voir aussi

- [`../README.md`](../README.md)
- [`../SETUP.md`](../SETUP.md)
- [`./local-db.md`](./local-db.md)
