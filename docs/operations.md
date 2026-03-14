# Guide d'exploitation de la production

Ce guide explique comment déployer, mettre à jour, superviser et restaurer l'environnement de production Taskmaster avec `docker-compose.prod.yml`.

## Contexte

Ce document cible la stack de production définie dans `../docker-compose.prod.yml` :

- `postgres`
- `redis`
- `migrator`
- `backend`
- `frontend`

Par défaut, les exemples utilisent `--env-file .env` parce que ce fichier existe dans le dépôt. Si votre environnement utilise un autre fichier, remplacez simplement ce paramètre.

## Pré-requis

- Avoir Docker et Docker Compose v2 installés.
- Avoir un fichier `../.env` renseigné à partir de `../.env.docker.example`.
- Avoir défini au minimum `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `AUTH_SECRET`, `BACKUP_ENCRYPTION_KEY` et `CORS_ORIGIN`.
- Exécuter les commandes depuis la racine du dépôt.

## Étapes

### Déployer la stack complète

1. Vérifiez la configuration d'environnement.
2. Construisez et démarrez les services.
3. Confirmez que les conteneurs sont sains.

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml --env-file .env ps
```

### Mettre à jour un service

1. Récupérez les derniers changements applicatifs.
2. Reconstruisez uniquement le service concerné.
3. Vérifiez les logs et l'état de santé.

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build --no-deps backend
docker compose -f docker-compose.prod.yml --env-file .env up -d --build --no-deps frontend
```

### Forcer l'exécution des migrations

Le service `migrator` s'exécute automatiquement au démarrage complet, mais vous pouvez le relancer manuellement :

```bash
docker compose -f docker-compose.prod.yml --env-file .env run --rm migrator
```

### Sauvegarder la base PostgreSQL

1. Créez un export SQL horodaté.
2. Vérifiez que le fichier généré a une taille cohérente.

```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker exec -t taskmaster_prod_db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > "backup_db_${TIMESTAMP}.sql"
ls -lh "backup_db_${TIMESTAMP}.sql"
```

### Restaurer une sauvegarde SQL

1. Arrêtez temporairement le backend pour éviter les écritures concurrentes.
2. Réinitialisez le schéma si vous voulez une restauration propre.
3. Réinjectez le dump SQL.
4. Redémarrez le backend.

```bash
docker stop taskmaster_prod_backend
docker exec -i taskmaster_prod_db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
cat backup_db_YYYYMMDD_HHMMSS.sql | docker exec -i taskmaster_prod_db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
docker start taskmaster_prod_backend
```

### Consulter les logs et la consommation

```bash
docker compose -f docker-compose.prod.yml --env-file .env logs -f
docker compose -f docker-compose.prod.yml --env-file .env logs -f --tail=100 backend
docker stats
```

### Appliquer un rollback applicatif

1. Revenez au commit stable.
2. Redéployez les services applicatifs.
3. Si nécessaire, restaurez la dernière sauvegarde compatible.

```bash
git revert HEAD
docker compose -f docker-compose.prod.yml --env-file .env up -d --build backend frontend
```

## Vérifications

- `docker compose -f docker-compose.prod.yml --env-file .env ps` montre `postgres`, `redis`, `backend` et `frontend` actifs.
- `curl http://localhost:3000/api/health` renvoie un statut `200`.
- `wget --spider http://localhost:80` confirme que le frontend répond.
- Les logs du backend ne montrent ni erreur Prisma ni erreur Redis au démarrage.

## Ressources

- Compose de production : [`../docker-compose.prod.yml`](../docker-compose.prod.yml)
- Variables d'environnement : [`../.env.docker.example`](../.env.docker.example)
- Guide de dépannage : [`./troubleshooting.md`](./troubleshooting.md)
- Runbook incident : [`./incident_runbook.md`](./incident_runbook.md)

Notes :

- Le service `migrator` exécute `npx prisma migrate deploy`.
- La génération Prisma est une dépendance implicite du build backend.
- En production, évitez les commandes destructrices hors fenêtre de maintenance validée.

## Voir aussi

- [`../README.md`](../README.md)
- [`../SETUP.md`](../SETUP.md)
- [`./local-db.md`](./local-db.md)
