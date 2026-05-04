# Guide de build Docker

Ce guide explique comment construire les images Docker de production de Taskmaster, quels fichiers sont impliqués et quels points vérifier avant un déploiement.

## Contexte

Le build s'appuie sur une seule image fullstack :

- `../Dockerfile`
- `../docker-compose.yml`
- `../docker-compose.build.yml`
- `../docker-compose.dockerhub.yml`

Les ordres de grandeur actuellement observés restent :

| Image | Taille observée | Statut |
| --- | --- | --- |
| `taskmaster:secure-local` | ~2.32 GB | valide |

La taille vient surtout de Chromium/Puppeteer, nécessaire à l'export PDF, et des dépendances backend Prisma/OpenTelemetry.

## Pré-requis

- Docker et Docker Compose v2 installés.
- Un fichier `../.env` prêt à être utilisé au moment du lancement de la stack.
- Les variables `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `AUTH_SECRET`, `BACKUP_ENCRYPTION_KEY` et `CORS_ORIGIN` définies.

## Étapes

### Construire les images

```bash
DOCKER_BUILDKIT=1 docker build -t taskmaster:secure-local -f Dockerfile .
```

Ou via Compose local :

```bash
DOCKER_BUILDKIT=1 docker compose -f docker-compose.build.yml build
```

### Démarrer la stack de production

```bash
TASKMASTER_IMAGE=taskmaster:secure-local docker compose --env-file .env up -d
```

### Relire les choix techniques

1. Le backend et le frontend utilisent un build multi-stage.
2. L'image finale démarre en utilisateur non-root (`node`).
3. Les dépendances runtime sont installées au build via `npm ci` et le lockfile.
4. Le conteneur ne fait plus d'installation npm au démarrage.
5. Les fichiers `.dockerignore` limitent le contexte de build.
6. Les migrations Prisma restent exécutées au démarrage par l'entrypoint.

### Relever les limites connues

1. Chromium est embarqué pour préserver l'export PDF, ce qui augmente fortement la taille.
2. Prisma CLI reste présent dans l'image pour `migrate deploy`.
3. Les vulnérabilités npm doivent être corrigées dans les dépendances, pas dans les Dockerfiles.

## Vérifications

- `docker build -t taskmaster:secure-local -f Dockerfile .` se termine sans erreur.
- `docker image inspect taskmaster:secure-local --format '{{.Config.User}}'` retourne `node`.
- `TASKMASTER_IMAGE=taskmaster:secure-local docker compose --env-file .env up -d` démarre les services attendus.
- `docker compose --env-file .env ps` montre les services actifs.
- `curl http://localhost:3000/api/health` répond correctement.

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
