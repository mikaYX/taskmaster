# Taskmaster sur Windows Server 2019 x64 — installation locale (sans Docker)

Ce document décrit l'installation de production de Taskmaster sur un Windows
Server 2019 x64 propre, entièrement locale, sans Docker, WSL, Git, npm ou
Node.js installés globalement sur le serveur cible. C'est le chemin
**recommandé** pour la production ; les procédures existantes
[`WINDOWS_DOCKER_PROCEDURE.txt`](../WINDOWS_DOCKER_PROCEDURE.txt) et
[`WINDOWS_LOCAL_NODE_PROCEDURE.txt`](../WINDOWS_LOCAL_NODE_PROCEDURE.txt) à la
racine du dépôt restent valides pour du développement/test — elles ne sont ni
supprimées ni remplacées par ce document.

## Vue d'ensemble

- **MSI** (`Taskmaster-<version>-x64.msi`) : installe uniquement Taskmaster
  (fichiers applicatifs, runtime Node embarqué, service Windows). Utilisable
  seul pour un déploiement scripté contre un PostgreSQL/Redis déjà en place.
- **Setup.exe** (`Taskmaster-Setup-<version>-x64.exe`) : chemin recommandé.
  Enchaîne PostgreSQL 17 x64, Memurai (cache compatible Redis), puis le MSI,
  puis l'orchestration (secrets, migration Prisma, service, contrôle de
  santé).

## Prérequis

- Windows Server 2019 x64, droits administrateur.
- Aucun logiciel préalable requis (ni Node, ni npm, ni Git, ni Docker, ni
  PostgreSQL) pour une installation locale simple.
- Accès réseau sortant **uniquement pendant la construction** de l'installeur
  (`installer/build.ps1`, sur une machine de build séparée) — le `Setup.exe`
  produit est utilisable hors ligne.

## Interface d'installation

Le `Setup.exe` utilise le Bootstrapper Application standard de WiX
(WixStandardBootstrapperApplication). Ce choix a été fait pour rester
simple et maintenable avec WiX seul plutôt que développer un assistant
graphique entièrement personnalisé (Managed Bootstrapper App .NET/WPF), ce
qui serait un chantier nettement plus lourd. Conséquence concrète :

- **Cas simple (recommandé)** : accepter les valeurs par défaut — port 3000,
  accès local uniquement, PostgreSQL et Memurai installés localement. Aucune
  question n'est posée au-delà des écrans standard (licence, répertoire
  d'installation, progression).
- **Cas avancé** (accès LAN, port personnalisé, serveur PostgreSQL/Redis
  existant) : ces choix se font via des propriétés passées en ligne de
  commande au lancement de `Setup.exe`, pas via des écrans graphiques
  supplémentaires :

  ```powershell
  Taskmaster-Setup-1.1.3-x64.exe /passive `
    PORT=8080 `
    ACCESS_MODE=Lan `
    HOST_NAME=taskmaster.monentreprise.local `
    POSTGRES_MODE=Existing `
    EXISTING_DATABASE_URL="postgresql://taskmaster:motdepasse@10.0.0.5:5432/taskmaster" `
    EXISTING_PG_BIN_PATH="C:\Program Files\PostgreSQL\17\bin" `
    REDIS_MODE=Existing `
    EXISTING_REDIS_URL="redis://10.0.0.5:6379"
  ```

  Une évolution future pourrait remplacer le Bootstrapper standard par un
  assistant graphique entièrement personnalisé si ce mode avancé doit devenir
  pilotable à la souris — voir le commentaire en tête de
  `installer/wix/Bundle.wxs`.

## Déroulé de l'installation (mode simple)

1. **Installation de PostgreSQL** — PostgreSQL 17 x64 installé silencieusement
   (serveur + outils en ligne de commande uniquement, sans pgAdmin), service
   Windows en démarrage automatique, écoute restreinte à `localhost`, port
   5432 **jamais** ouvert dans le pare-feu.
2. **Initialisation de la base** — création idempotente du rôle `taskmaster`
   (sans droits superutilisateur) et de la base `taskmaster`, mot de passe
   généré cryptographiquement.
3. **Installation du cache** — Memurai (compatible Redis) installé en
   service Windows, lié à `127.0.0.1`, port 6379 jamais ouvert dans le
   pare-feu.
4. **Migration Prisma** — `prisma migrate deploy` exécuté avec le Node
   embarqué.
5. **Installation du service** — le service Windows **Taskmaster** est
   enregistré (WinSW), démarrage automatique différé, redémarrage
   automatique en cas de crash, aucun secret dans la configuration du
   service.
6. **Démarrage** — le service démarre ; aucune fenêtre de terminal ne reste
   ouverte à la fin de l'installation.
7. **Contrôle de santé** — vérifie : service PostgreSQL actif, service
   Memurai actif, service Taskmaster actif, `GET /api/health`, `GET /`,
   présence du frontend (`client/index.html`). **L'installation n'est
   jamais annoncée comme réussie si un de ces contrôles échoue** — un
   message en français indique le contrôle en échec et le chemin du journal
   (`C:\ProgramData\Taskmaster\logs\install.log`), sans jamais exposer de
   secret.

À la fin, un raccourci **Taskmaster** est créé dans le menu Démarrer, ouvrant
`http://localhost:3000/` (ou l'URL configurée). Créez le premier compte
`SUPER_ADMIN` via le Setup Wizard web existant de Taskmaster.

## Emplacements sur disque

```
C:\Program Files\Taskmaster\
  app\            (fichiers applicatifs — immuables, remplacés à chaque mise à niveau)
  runtime\node\   (runtime Node.js 24 LTS x64 portable — jamais installé globalement, PATH système non modifié)
  service\        (WinSW + descripteur de service)

C:\ProgramData\Taskmaster\
  config\.env     (configuration + secrets — lecture restreinte à Administrateurs, SYSTEM, compte du service)
  data\
  public\uploads\
  storage\procedures\
  backups\
  logs\
```

`C:\ProgramData\Taskmaster\config\.env` est créé **une seule fois**, à la
première installation, et n'est plus jamais recréé ni écrasé (réparation
MSI, mise à niveau) — voir `installer/common/Taskmaster.Common.psm1`
(`New-EnvFileIfMissing`).

## Sauvegarde et restauration

Les sauvegardes/restaurations PostgreSQL utilisent `pg_dump.exe`/
`pg_restore.exe` (chemin absolu dans `PG_BIN_PATH`) via `execFile`/`spawn`
avec des tableaux d'arguments — jamais de chaîne shell contenant
`DATABASE_URL`. Aucun repli Docker n'existe sur ce chemin d'installation
Windows.

## Mise à niveau

Une mise à niveau MSI (`MajorUpgrade` dans `installer/wix/Product.wxs`) :
arrête proprement le service, conserve `ProgramData` (config, uploads,
procédures, sauvegardes, base de données), effectue une sauvegarde
PostgreSQL avant migration, applique `prisma migrate deploy`, redémarre,
contrôle `/api/health` — **sans jamais régénérer les secrets**.

Une réparation MSI (`msiexec /fa`) ne touche jamais `.env` (ce fichier n'est
délibérément jamais un composant MSI).

## Désinstallation

- **Désinstallation par défaut** (menu "Programmes et fonctionnalités" ou
  `msiexec /x`) : arrête et supprime uniquement le service Taskmaster,
  retire les fichiers de `Program Files` et le raccourci. **Conserve**
  `ProgramData`, PostgreSQL, Memurai et la base de données.
- **Purge complète** (`installer/purge/purge-full.ps1`, à exécuter
  manuellement — il n'y a délibérément aucun raccourci automatique vers ce
  script) : supprime `ProgramData\Taskmaster` et, uniquement après
  confirmation explicite du nom et de l'emplacement de la base, une base
  PostgreSQL **locale**. Ce script ne supprime **jamais** une base externe.

## Export PDF hors ligne

`AnalyticsPdfService` détecte Microsoft Edge sur Windows (aucun Chromium
embarqué par défaut — voir la décision documentée dans
`backend/src/analytics/analytics-pdf.service.ts`) et n'importe plus aucune
police externe (Google Fonts a été retiré du gabarit HTML au profit de la
pile de polices système), ce qui permet l'export PDF sans connexion
Internet.

## `OFFLINE_MODE`

`OFFLINE_MODE=true` désactive les vérifications automatiques de mise à jour
via l'API GitHub / Docker Hub (`backend/src/system/version.service.ts`).
Les intégrations externes explicitement configurées par un administrateur
(SSO, SMTP, etc.) restent disponibles.

## Construire les installeurs

Sur une machine de build **Windows x64** (jamais Linux — les binaires
natifs Prisma/bcrypt doivent être compilés/téléchargés pour Windows) :

```powershell
cd installer
.\build.ps1
```

Voir `installer/build.ps1` pour le détail des étapes (npm ci, génération
Prisma, typecheck/tests/lint, build, staging, téléchargement du runtime
Node/WinSW avec vérification SHA-256, construction MSI puis Setup.exe,
sommes de contrôle finales, signature Authenticode optionnelle). Voir
`installer/payloads/README.md` pour la gestion des paquets tiers
(PostgreSQL auto-téléchargé, Memurai à fournir manuellement pour des raisons
de licence).

## Tester une installation

```powershell
.\installer\test-install.ps1 -SetupExePath 'C:\...\Taskmaster-Setup-1.1.3-x64.exe'
```

Automatise la checklist de contrôle de santé ci-dessus, ainsi que les
scénarios de mise à niveau et de désinstallation par défaut. N'exécutez ce
script que sur une VM jetable — il installe de vrais services Windows.

## Limites connues / ce qui doit être validé sur une vraie machine Windows

Ce document et l'ensemble de `installer/` ont été rédigés et vérifiés
statiquement dans un environnement de développement Linux, qui ne permet ni
de construire (`wix build`), ni d'exécuter ces scripts PowerShell, ni
d'installer un service Windows réel. Doivent être validés sur un Windows
Server 2019 x64 réel avant toute mise en production :

- La construction effective du `.msi`/`.exe` (`installer/build.ps1`) et en
  particulier la stratégie de `node_modules` de production sous npm
  workspaces (voir le commentaire dans `build.ps1`, étape 7).
- Le chargement du module natif `bcrypt` sous le runtime Node embarqué
  (repli documenté : `bcryptjs` si aucun binaire précompilé n'est
  disponible pour la version Windows/Node ciblée).
- L'exécution réelle de `Setup.exe` : installation silencieuse de
  PostgreSQL/Memurai, installation du service WinSW, droits du compte
  `NT AUTHORITY\LocalService` sur `ProgramData\Taskmaster` (repli documenté :
  compte de service dédié à faibles privilèges si LocalService s'avère
  insuffisant).
- Les scénarios de mise à niveau, réparation et désinstallation.
- Le comportement réel du pare-feu (aucune règle pour 5432/6379, une seule
  règle pour le port applicatif en mode LAN).
