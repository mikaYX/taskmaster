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


### Une sauvegarde échoue après une installation Windows (service)

Le service utilise `TASKMASTER_DATA_DIR` (par défaut `C:\ProgramData\Taskmaster`)
pour les fichiers modifiables. Un chemin de sauvegarde relatif, par exemple
`./backups`, est résolu à partir de ce dossier. Un chemin absolu configuré dans
les paramètres reste prioritaire. Le compte du service doit pouvoir créer,
modifier et supprimer les fichiers à cet emplacement. Pour un partage réseau,
vérifier les droits du compte du service et utiliser un chemin UNC ; les lecteurs
réseau montés dans une session administrateur ne sont pas nécessairement visibles
par le service.

`PG_BIN_PATH` doit désigner le dossier `bin` PostgreSQL installé, par exemple
`C:\Program Files\PostgreSQL\18\bin` (sans guillemets dans la valeur).
L'installateur le renseigne ; les sauvegardes utilisent directement
`pg_dump.exe` et les restaurations `pg_restore.exe` dans ce dossier, sans dépendre
du `PATH` de la session interactive. La version de `pg_dump` doit être compatible
avec celle du serveur. Redémarrer le service après un changement de configuration.

La fenêtre de sauvegarde attend désormais la fin du traitement et affiche son
erreur en cas d'échec ; l'acceptation dans la file d'attente n'est pas une réussite.
Une archive n'apparaît dans l'historique qu'après chiffrement et signature.
Si le suivi est interrompu, consulter l'historique avant de relancer une sauvegarde.

Les sauvegardes `FULL` incluent les uploads et les procédures du dossier de données,
y compris un éventuel `PROCEDURE_STORAGE_PATH` personnalisé. Les secrets `.env`
restent exclus : conserver la clé de chiffrement séparément. Une erreur de rétention
est journalisée sans supprimer la nouvelle sauvegarde achevée.

## La fenêtre de changement de mot de passe ne s’affiche pas après réinitialisation

La réinitialisation depuis la gestion des utilisateurs marque le compte avec
`mustChangePassword=true`. La session doit ensuite transmettre ce champ au
navigateur. Le serveur invalide désormais son cache après la réinitialisation
et après une connexion réussie ; les anciens caches dépourvus de ce champ sont
reconstruits. Une session déjà ouverte est revérifiée au retour dans l’onglet.

Après installation du correctif, se reconnecter avec le mot de passe temporaire
fourni lors de la réinitialisation. C’est également ce mot de passe temporaire
qu’il faut saisir dans **Mot de passe actuel** pour choisir le nouveau.
Le changement de mot de passe précède l’enrôlement passkey si les deux sont requis.

Une remise à zéro complète de la base et la création du premier compte dans le
Setup Wizard constituent un autre parcours : le mot de passe est choisi par
l’utilisateur à la création, sans réinitialisation administrative préalable.
