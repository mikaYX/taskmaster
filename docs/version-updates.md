# Guide des mises a jour de version

Ce guide explique comment Taskmaster detecte les nouvelles versions, comment appliquer une mise a jour dans une installation locale ou Docker, et quoi verifier si le controle de version echoue.

## Vue d'ensemble

La page `Parametres > Updates` et l'API `GET /api/system/version` exposent l'etat du controle de version.
L'action `Refresh` appelle `POST /api/system/version/refresh` pour forcer une nouvelle verification sans attendre l'expiration du cache backend.

Le backend choisit automatiquement la source officielle a interroger selon le mode de deploiement :

- installation locale ou source : releases GitHub du depot officiel `mikaYX/taskmaster`
- stack Docker avec `TASKMASTER_IMAGE` pointant vers une image Docker Hub : tags Docker Hub de l'image configuree
- image locale ou registre non Docker Hub (par exemple `taskmaster:secure-local`) : retour automatique vers les releases GitHub

Les variables `VERSION_CHECK_REPO` et `VERSION_CHECK_DOCKER_IMAGE` servent uniquement a rediriger le controle de version vers un fork.

## Variables utiles

| Variable | Usage |
| --- | --- |
| `TASKMASTER_IMAGE` | Image utilisee par Docker Compose. Si la valeur ressemble a `namespace/repository[:tag]` sur Docker Hub, Taskmaster compare aux tags Docker Hub correspondants. |
| `VERSION_CHECK_REPO` | Override GitHub pour une installation source ou un fork publie sur GitHub. Format attendu : `owner/repository`. |
| `VERSION_CHECK_DOCKER_IMAGE` | Override Docker Hub pour un fork publie sur Docker Hub. Format attendu : `namespace/repository[:tag]`. |

## Installation locale

### Ce que verifie Taskmaster

Dans une installation locale hors Docker Hub, Taskmaster compare la version courante aux releases GitHub du depot officiel.
Si l'API Releases n'est pas disponible, le backend tente un fallback vers `https://raw.githubusercontent.com/<repo>/main/package.json`.

### Mettre a jour une installation locale

1. Recuperer les derniers commits.
2. Installer ou mettre a jour les dependances npm.
3. Verifier que PostgreSQL et Redis locaux tournent toujours.
4. Appliquer les migrations backend.
5. Rebuild puis redemarrer les processus locaux.

```bash
git pull
npm install
#facultatif si la database postgre est installer hors docker
docker compose -f docker-compose.local-db.yml up -d

cd backend
npx prisma migrate deploy
cd ..

npm run build
npm run dev
```

Si l'application locale tourne deja via un gestionnaire de processus (`systemd`, `pm2`, service maison), remplacez `npm run dev` par le restart adapte apres le build.

### Verifier la source hors application

```bash
curl -I https://api.github.com/repos/mikaYX/taskmaster/releases/latest
curl -I https://raw.githubusercontent.com/mikaYX/taskmaster/main/package.json
```

Les deux commandes doivent repondre en HTTPS sans erreur DNS, TLS ou timeout.

## Deploiement Docker

### Ce que verifie Taskmaster

Si `TASKMASTER_IMAGE` pointe vers Docker Hub, Taskmaster compare la version courante aux tags publies pour cette image.
Exemple : `mikaxy/taskmaster:latest` active la verification Docker Hub sur `mikaxy/taskmaster`.

Si vous utilisez une image locale ou privee comme `taskmaster:secure-local`, la verification repasse automatiquement par GitHub.

### Mettre a jour une stack Docker

1. Sauvegarder la base avant toute mise a jour.
2. Mettre a jour `TASKMASTER_IMAGE` dans `.env` si vous ciblez un tag precis.
3. Recuperer l'image.
4. Redemarrer uniquement le service applicatif.

```bash
docker compose --env-file .env pull app
docker compose --env-file .env up -d app
docker compose --env-file .env logs --tail=100 app
```

Pour un fork Docker Hub, ajoutez `VERSION_CHECK_DOCKER_IMAGE=namespace/repository` afin que l'ecran Updates compare au bon repository.

### Verifier la source hors application

```bash
curl -I "https://hub.docker.com/v2/namespaces/mikaxy/repositories/taskmaster/tags?page=1&page_size=100"
grep -E "^(TASKMASTER_IMAGE|VERSION_CHECK_DOCKER_IMAGE)=" .env
```

La verification Docker Hub n'est utile que si `TASKMASTER_IMAGE` designe bien une image Docker Hub.

## Diagnostiquer un echec du controle de version

Quand l'interface affiche `Check failed` ou `Unable to check for updates`, le detail technique se trouve dans les logs backend.

Recherchez en priorite ces messages :

- `GitHub Releases API failed`
- `GitHub package.json fallback failed`
- `Docker Hub tags API failed`
- `Ignoring invalid VERSION_CHECK_REPO value`
- `Ignoring invalid VERSION_CHECK_DOCKER_IMAGE value`

Points a verifier :

- acces sortant HTTPS vers GitHub ou Docker Hub
- resolution DNS depuis le processus backend
- certificat TLS local ou d'entreprise si `curl` fonctionne mais Node echoue
- valeur effective de `TASKMASTER_IMAGE` et des overrides de fork
- redemarrage du backend apres une mise a jour ou un patch

Sur une installation locale, les logs sont generalement dans le terminal qui lance `npm run dev`, `npm -w backend run start:dev` ou `node dist/main`.
Sur une stack Docker, utilisez `docker compose --env-file .env logs -f app`.

## Voir aussi

- [README principal](../README.md)
- [Guide d'exploitation](operations.md)
- [Guide de build Docker](DOCKER-BUILD.md)
- [Guide de depannage](troubleshooting.md)