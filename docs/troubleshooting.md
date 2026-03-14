# Guide de dépannage

Ce guide explique comment diagnostiquer les incidents de production les plus fréquents sur Taskmaster et appliquer une correction cohérente avec la stack Docker actuelle.

## Contexte

Le guide couvre principalement les problèmes liés à `docker-compose.prod.yml` :

- connexion PostgreSQL
- connexion Redis
- erreurs CORS
- migrations Prisma
- routage SPA côté frontend

## Pré-requis

- Avoir accès à l'hôte qui exécute les conteneurs.
- Disposer du fichier `../.env` utilisé avec `docker-compose.prod.yml`.
- Exécuter les commandes depuis la racine du dépôt.
- Avoir consulté le runbook incident si l'impact est déjà confirmé comme majeur.

## Étapes

### Diagnostiquer une panne de base de données

1. Vérifiez l'état du conteneur PostgreSQL.
2. Consultez les logs du service.
3. Validez l'état Prisma via le `migrator`.

```bash
docker ps --filter "name=taskmaster_prod_db"
docker logs taskmaster_prod_db
docker compose -f docker-compose.prod.yml --env-file .env run --rm migrator npx prisma migrate status
```

Corrections possibles :

- Redémarrer le conteneur : `docker start taskmaster_prod_db`
- Restaurer une sauvegarde si le volume est corrompu
- Vérifier le réseau Docker si la base répond localement mais pas depuis le backend

### Diagnostiquer Redis ou une limitation excessive

1. Testez la réponse de Redis.
2. Contrôlez la mémoire.
3. Vérifiez si les erreurs `429` correspondent à une vraie montée en charge.

```bash
docker exec -it taskmaster_prod_redis redis-cli ping
docker exec -it taskmaster_prod_redis redis-cli info memory
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=100 backend
```

Correction de dernier recours :

```bash
docker exec -it taskmaster_prod_redis redis-cli FLUSHALL
```

### Corriger une erreur CORS

1. Vérifiez la valeur de `CORS_ORIGIN`.
2. Comparez-la à l'origine réellement envoyée par le navigateur.
3. Redémarrez le backend après correction.

```bash
grep CORS_ORIGIN .env
docker compose -f docker-compose.prod.yml --env-file .env restart backend
```

### Résoudre un échec de migration

1. Consultez les logs du `migrator`.
2. Identifiez un drift, un verrou ou une migration incomplète.
3. N'utilisez `migrate resolve` qu'après validation explicite de l'état de la base.

```bash
docker logs taskmaster_prod_migrator
docker compose -f docker-compose.prod.yml --env-file .env run --rm migrator npx prisma migrate status
```

Si nécessaire :

```bash
docker compose -f docker-compose.prod.yml --env-file .env run --rm migrator npx prisma migrate resolve --applied <migration_name>
```

### Corriger un `404` frontend sur une route applicative

1. Vérifiez que le frontend sert bien une SPA.
2. Rebuild le conteneur frontend après modification de la configuration Nginx.

Réglage attendu :

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

### Centraliser les logs utiles

```bash
docker compose -f docker-compose.prod.yml --env-file .env logs -f --tail=50
docker inspect --format='{{json .State.Health.Status}}' taskmaster_prod_backend
```

## Vérifications

- `docker compose -f docker-compose.prod.yml --env-file .env ps` n'affiche plus de service en échec.
- `curl http://localhost:3000/api/health` renvoie `200`.
- Les logs du backend ne montrent plus d'erreur Prisma, Redis ou CORS après redémarrage.
- Un rechargement d'une route frontend profonde ne renvoie plus `404`.

## Ressources

- Déploiement et restauration : [`./operations.md`](./operations.md)
- Runbook incident : [`./incident_runbook.md`](./incident_runbook.md)
- Compose de production : [`../docker-compose.prod.yml`](../docker-compose.prod.yml)
- Exemple d'environnement : [`../.env.docker.example`](../.env.docker.example)

Notes :

- `migrator` exécute Prisma dans le conteneur de build backend.
- Une remise à zéro Prisma en production implique une perte de données et doit rester exceptionnelle.

## Voir aussi

- [`../README.md`](../README.md)
- [`../SETUP.md`](../SETUP.md)
