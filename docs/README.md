# Documentation Taskmaster

Index de la documentation complémentaire du projet.

---

## Utilisation et métier

| Document | Description |
|----------|-------------|
| [Guide utilisateur](user-guide.md) | Utilisation quotidienne : tableau de bord, validation et échec des tâches, délégations, todos, analytiques |
| [Cas d’usage et planification](use-cases.md) | Exemples concrets (rondes sécurité, contrôles qualité, mensuels, trimestriels) et règles de planification (RRULE) |

---

## Technique et exploitation

| Document | Description |
|----------|-------------|
| [Authentification](authentication.md) | Configuration SSO, LDAP, OIDC, SAML, MFA |
| [Base locale](local-db.md) | PostgreSQL et Redis pour le développement |
| [Build Docker](DOCKER-BUILD.md) | Construction et publication des images |
| [Exploitation](operations.md) | Références d’exploitation et administration |
| [Dépannage](troubleshooting.md) | Résolution des problèmes courants |
| [Runbook incident](incident_runbook.md) | Procédures en cas d’incident |

---

## Captures d’écran

Le dossier [`screenshots/`](screenshots/) contient les captures utilisées dans le README principal et pour la doc :

| Fichier | Contenu |
|---------|--------|
| `01-task-board.png` | Tableau de bord opérationnel |
| `02-analytics.png` | Page Analytiques (tendances, conformité) |
| `03-task-definitions.png` | Liste des définitions de tâches |
| `04-settings.png` | Paramètres et intégrations |
| `05-login.png` | Page de connexion |
| `06-todos.png` | Liste des tâches à faire (todos) |
| `07-profile.png` | Page profil utilisateur |
| `wizard-01-definition.png` | Wizard création de tâche — étape 1 : Définition |
| `wizard-02-scheduling.png` | Wizard — étape 2 : Planification |
| `wizard-03-assignment.png` | Wizard — étape 3 : Assignation |
| `wizard-04-notifications.png` | Wizard — étape 4 : Notifications |
| `wizard-05-review.png` | Wizard — étape 5 : Synthèse et création |

Pour régénérer les captures (app et base seedées) :

```bash
# Depuis la racine du projet
npm run dev   # dans un terminal
# Dans un autre terminal (backend seedé avec db:seed-test-tasks et db:seed-demo) :
TASKMASTER_FRONTEND_URL=http://localhost:5173 node scripts/screenshots-for-docs.cjs
```
