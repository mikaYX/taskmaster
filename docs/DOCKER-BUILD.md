# Guide de build Docker

Ce guide explique comment construire les images Docker de production de Taskmaster, quels fichiers sont impliqués et quels points vérifier avant un déploiement.

## Contexte

Le build s'appuie sur :

- `../backend/Dockerfile`
- `../frontend/Dockerfile`
- `../docker-compose.prod.yml`

Les ordres de grandeur actuellement documentés restent :

| Image | Taille observée | Statut |
| --- | --- | --- |
| `taskmaster-backend:latest` | ~1.07 GB | valide |
| `taskmaster-frontend:latest` | ~95 MB | valide |

## Pré-requis

- Docker et Docker Compose v2 installés.
- Un fichier `../.env` prêt à être utilisé au moment du lancement de la stack.
- Les variables `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `AUTH_SECRET`, `BACKUP_ENCRYPTION_KEY` et `CORS_ORIGIN` définies.

## Étapes

### Construire les images

```bash
DOCKER_BUILDKIT=1 docker compose -f docker-compose.prod.yml build backend frontend
```

### Démarrer la stack de production

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

### Relire les choix techniques

1. Le backend et le frontend utilisent un build multi-stage.
2. Le backend reste exécutable avec un utilisateur non root.
3. Les fichiers `.dockerignore` limitent le contexte de build.
4. Le `migrator` repose sur le stage builder pour disposer de Prisma.

### Relever les limites connues

1. La reproductibilité dépend encore de la stratégie de lockfiles par application.
2. Le `migrator` reste plus lourd qu'un conteneur dédié minimal.
3. Les vulnérabilités npm doivent être corrigées dans les dépendances, pas dans les Dockerfiles.

## Vérifications

- `docker compose -f docker-compose.prod.yml build backend frontend` se termine sans erreur.
- `docker compose -f docker-compose.prod.yml --env-file .env up -d` démarre les services attendus.
- `docker compose -f docker-compose.prod.yml --env-file .env ps` montre le backend et le frontend actifs.
- `curl http://localhost:3000/api/health` et `wget --spider http://localhost:80` répondent correctement.

## Ressources

- Dossier backend : [`../backend`](../backend)
- Dossier frontend : [`../frontend`](../frontend)
- Compose de production : [`../docker-compose.prod.yml`](../docker-compose.prod.yml)
- Variables d'environnement : [`../.env.docker.example`](../.env.docker.example)

Notes :

- Prisma est une dépendance implicite du `migrator`.
- Le backend n'embarque pas `curl` ; le healthcheck repose sur Node dans le compose.

## Voir aussi

- [`./operations.md`](./operations.md)
- [`./troubleshooting.md`](./troubleshooting.md)
