# Runbook incident

Ce guide explique comment qualifier un incident, lancer les premiers diagnostics et appliquer les actions de rétablissement adaptées sur Taskmaster.

## Contexte

Le runbook s'applique à l'environnement déployé avec `../docker-compose.prod.yml`, en priorité pour :

- indisponibilité complète du service
- perte d'accès base de données ou Redis
- échec de migration
- saturation de traitements asynchrones
- incident sécurité ou authentification

## Pré-requis

- Avoir accès aux logs Docker et au fichier `../.env`.
- Savoir identifier le niveau de sévérité de l'incident.
- Prévenir un responsable avant toute action destructive.

## Étapes

### Qualifier la sévérité

1. Classez l'incident en `SEV-1`, `SEV-2` ou `SEV-3`.
2. Escaladez immédiatement les `SEV-1`.

| Niveau | Définition | Délai de réponse cible |
| --- | --- | --- |
| `SEV-1` | Service indisponible, perte de données, incident sécurité | 15 min |
| `SEV-2` | Fonction majeure dégradée, forte latence, erreurs répétées | 1 h |
| `SEV-3` | Incident mineur ou contournable | 24 h |

### Lancer le diagnostic initial

1. Vérifiez la santé globale.
2. Consultez les logs applicatifs.
3. Isolez le service en cause.

```bash
curl http://localhost:3000/api/health
docker compose -f docker-compose.prod.yml --env-file .env logs -f --tail=100 backend
docker compose -f docker-compose.prod.yml --env-file .env ps
```

Repères utiles :

- `database` correspond à la connexion Prisma
- `redis` correspond à la connectivité Redis
- l'absence de réponse HTTP indique souvent un problème backend ou réseau local

### Traiter les scénarios les plus fréquents

#### Incident base de données

1. Vérifiez PostgreSQL.
2. Consultez les logs du backend et du conteneur DB.
3. Redémarrez le backend si la base est revenue.

```bash
docker exec -it taskmaster_prod_db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
docker logs taskmaster_prod_db
docker compose -f docker-compose.prod.yml --env-file .env restart backend
```

#### File Redis ou traitements bloqués

1. Contrôlez Redis.
2. Vérifiez si les jobs échouent en boucle.
3. Ne videz Redis qu'en dernier recours.

```bash
docker exec -it taskmaster_prod_redis redis-cli info memory
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=200 backend
```

#### Échec de migration

1. Consultez les logs du `migrator`.
2. Vérifiez l'état des migrations Prisma.
3. Préparez une restauration si une incohérence de schéma est confirmée.

```bash
docker logs taskmaster_prod_migrator
docker compose -f docker-compose.prod.yml --env-file .env run --rm migrator npx prisma migrate status
```

#### Incident messagerie

1. Vérifiez le fournisseur externe.
2. Contrôlez les paramètres configurés dans l'application.
3. Réduisez le bruit opérationnel avant de reprendre les envois.

### Rétablir le service

1. Appliquez le correctif le moins risqué.
2. Redémarrez uniquement les services nécessaires.
3. Documentez l'action réalisée et son heure.

Actions possibles :

- restauration d'un dump SQL validé
- redémarrage du backend ou du frontend
- relance du `migrator`
- correction de variable d'environnement puis redéploiement

## Vérifications

- `curl http://localhost:3000/api/health` renvoie `200`.
- Les conteneurs critiques sont `Up` dans `docker compose ... ps`.
- Les logs ne montrent plus de boucle d'erreurs après l'action.
- L'incident et les actions prises sont consignés dans un ticket ou un canal d'astreinte.

## Ressources

- Guide d'exploitation : [`./operations.md`](./operations.md)
- Guide de dépannage : [`./troubleshooting.md`](./troubleshooting.md)
- Compose de production : [`../docker-compose.prod.yml`](../docker-compose.prod.yml)
- Variables Docker : [`../.env.docker.example`](../.env.docker.example)

Notes :

- Les sauvegardes et restaurations Prisma/PostgreSQL supposent que le schéma cible est connu.
- Le service `migrator` repose sur Prisma et doit être surveillé après chaque déploiement.

## Voir aussi

- [`../README.md`](../README.md)
- [`../SETUP.md`](../SETUP.md)
