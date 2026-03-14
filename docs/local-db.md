# Guide base locale

Ce guide explique comment lancer uniquement PostgreSQL et Redis en local pour développer le backend Taskmaster sans démarrer la stack de production.

## Contexte

Le fichier `../docker-compose.local-db.yml` ne démarre que deux services :

- `postgres`
- `redis`

Il ne contient pas de service `migrator`, ni de conteneur frontend ou backend.

## Pré-requis

- Docker et Docker Compose v2 installés.
- Un fichier `../.env` compatible avec vos usages locaux si le backend lit la racine.
- Un terminal positionné à la racine du dépôt.

## Étapes

### Démarrer PostgreSQL et Redis

```bash
docker compose -f docker-compose.local-db.yml up -d
```

### Vérifier l'état des services

```bash
docker compose -f docker-compose.local-db.yml ps
docker compose -f docker-compose.local-db.yml logs -f
```

### Configurer le backend local

1. Utilisez les chaînes de connexion locales suivantes.
2. Générez Prisma si nécessaire.
3. Appliquez vos migrations depuis `backend/`.

```ini
DATABASE_URL=postgresql://taskmaster:taskmaster_dev@127.0.0.1:5432/taskmaster
REDIS_URL=redis://127.0.0.1:6379
```

```bash
cd backend
npx prisma generate
npx prisma migrate deploy
```

### Arrêter ou réinitialiser les services

```bash
docker compose -f docker-compose.local-db.yml down
docker compose -f docker-compose.local-db.yml down -v
```

## Vérifications

- `docker compose -f docker-compose.local-db.yml ps` montre `postgres` et `redis` démarrés.
- `pg_isready` répond correctement si vous testez le conteneur PostgreSQL.
- `redis-cli ping` renvoie `PONG`.
- Le backend peut se connecter avec les valeurs de `DATABASE_URL` et `REDIS_URL`.

## Ressources

- Compose local : [`../docker-compose.local-db.yml`](../docker-compose.local-db.yml)
- Guide d'installation : [`../SETUP.md`](../SETUP.md)
- Point d'entrée projet : [`../README.md`](../README.md)

Notes :

- Prisma n'est pas exécuté automatiquement par `docker-compose.local-db.yml`.
- La commande `npx prisma generate` est une dépendance implicite si les types Prisma sont absents ou obsolètes.

## Voir aussi

- [`./operations.md`](./operations.md)
- [`./troubleshooting.md`](./troubleshooting.md)
