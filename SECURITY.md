# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.1.x   | ✅        |
| < 1.1   | ❌        |

Seule la dernière mineure de la branche `main` reçoit des correctifs de sécurité.
Les déploiements sur d'anciennes versions doivent être mis à jour avant tout signalement.

## Reporting a Vulnerability

Merci de **ne pas ouvrir d'issue publique** pour une vulnérabilité.

Privilégier l'un des canaux suivants :

1. **GitHub Security Advisories** : onglet *Security* du dépôt → *Report a vulnerability*.
2. À défaut, contacter le mainteneur en privé via le mail listé dans le profil GitHub.

Inclure dans le rapport :

- une description du problème et du fichier / module impacté ;
- les étapes de reproduction (minimal repro si possible) ;
- l'impact estimé (CVSS si pertinent) ;
- toute version / configuration spécifique.

Engagement :

- accusé de réception sous **5 jours ouvrés** ;
- évaluation et plan de correction sous **15 jours ouvrés** ;
- publication d'un *advisory* coordonné après correction et release.

## Périmètre

En scope :

- backend NestJS (`backend/`) — authentification, autorisation, validation, audit.
- frontend React (`frontend/`) — XSS, gestion des sessions, expositions de données.
- pipeline Docker (`Dockerfile`, `docker-compose*.yml`) et scripts (`scripts/`).
- dépendances directes listées dans `package.json` (racine, `backend/`, `frontend/`).

Hors scope :

- attaques nécessitant un accès physique au serveur ou aux secrets ;
- dépendances tierces avec un advisory public déjà connu et non encore corrigé en amont (signaler à l'éditeur originel) ;
- déni de service par saturation réseau.

## Bonnes pratiques de déploiement

Voir [backend/SECURITY.md](backend/SECURITY.md) pour la liste détaillée des
contrôles implémentés (JWT rotation, MFA, rate limiting, chiffrement backups,
SSRF protection, etc.) et [backend/docs/auth-hardening-report.md](backend/docs/auth-hardening-report.md)
pour le hardening de l'authentification.
