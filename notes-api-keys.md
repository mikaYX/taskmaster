# TaskMaster - API Keys : possibilites et cas d'usage

## Principe

Les API Keys permettent un acces **machine-to-machine** a l'API de TaskMaster,
sans passer par le flow de connexion humain (login/password + JWT).

Un admin genere une cle depuis `Settings > API Keys`. La cle brute (`sk_...`) n'est
affichee qu'une seule fois. Elle est hashee (SHA-256) en base.

## Authentification

Ajouter le header suivant a chaque requete :

```
X-API-KEY: sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Les endpoints proteges par le guard composite (tasks, calendar, schedules)
acceptent indifferemment un JWT ou une API Key.

## Scopes disponibles

Chaque cle peut etre restreinte a un sous-ensemble de permissions :

| Scope | Description |
|---|---|
| `task:read` | Lire les taches et leurs statuts |
| `task:create` | Creer des taches |
| `task:update` | Modifier des taches / valider des occurrences |
| `task:delete` | Supprimer des taches |
| `schedule:read` | Lire les plannings |
| `schedule:create` | Creer des plannings |
| `schedule:update` | Modifier des plannings |
| `schedule:delete` | Supprimer des plannings |
| `user:read` | Lire la liste des utilisateurs |
| `user:write` | Gerer les utilisateurs |
| `settings:read` | Lire la configuration |
| `settings:write` | Modifier la configuration |
| `backup:read` | Consulter les backups |
| `backup:write` | Declencher des backups |
| `export:read` | Telecharger des exports |

## Cas d'usage concrets

### 1. Tableau de bord atelier / ecran TV
Un ecran dans l'atelier affiche l'etat des taches du jour.
- Appel : `GET /api/tasks` ou `GET /api/calendar`

### 2. Integration ERP / GMAO
L'ERP cree ou valide des taches automatiquement.
- Scope : `task:read`, `task:create`, `task:update`
- Appel : `POST /api/tasks`, `PATCH /api/tasks/:id/status`

### 3. Scripts d'automatisation (cron, Python, etc.)
Un script valide des taches en masse ou genere des rapports.
- Scope : selon le besoin
- Exemple : script Python qui valide toutes les taches de maintenance quotidiennes

### 4. Workflows no-code (n8n, Zapier, Power Automate)
Un outil tiers declenche des actions dans TaskMaster via webhook.
- Scope : selon le workflow

### 5. Supervision / monitoring (Nagios, Zabbix, Grafana)
Verifier que les taches critiques sont bien realisees chaque jour.
- Alerte si une tache critique est en statut MISSING ou FAILED

### 6. Application mobile custom
Une appli legere consomme l'API sans implementer le flow JWT complet.
- Scope : restreint au minimum necessaire

## Securite

- La cle brute n'est visible qu'a la creation (non recuperable ensuite)
- Stockage en base : hash SHA-256 uniquement
- Revocation instantanee depuis l'UI admin
- Expiration optionnelle configurable
- `lastUsedAt` mis a jour a chaque utilisation pour audit
