# Guide grace window auth

Ce guide explique le fonctionnement de la grace window des refresh tokens, ses compromis de sécurité et la procédure de bascule d'urgence.

## Contexte

La grace window absorbe les doubles refresh légitimes liés aux accès concurrents ou aux retards réseau, sans révoquer immédiatement toute la famille de jetons.

Le compromis est volontaire :

- meilleure résilience côté utilisateur ;
- tolérance limitée dans le temps ;
- révocation stricte dès qu'un rejeu sort de la fenêtre autorisée.

## Pré-requis

- Comprendre le flux `accessToken` / `refreshToken`.
- Avoir accès au fichier d'environnement ou à la configuration de déploiement.
- Pouvoir redémarrer le backend si une bascule est nécessaire.

## Étapes

### Comprendre le mécanisme

1. Un refresh token valide est échangé contre un nouveau jeu de jetons.
2. Si l'ancien token est rejoué très vite, le backend peut le considérer comme une course réseau légitime.
3. Si le rejeu survient hors de la fenêtre configurée, la révocation de famille s'applique.

### Configurer les garde-fous

| Variable | Rôle | Valeur par défaut | Bornes attendues |
| --- | --- | --- | --- |
| `AUTH_GRACE_WINDOW_ENABLED` | active ou désactive la tolérance | `true` | `true` ou `false` |
| `AUTH_GRACE_WINDOW_SECONDS` | durée de tolérance | `60` | entier de `1` à `300` |

Une configuration invalide doit faire échouer le démarrage du backend.

### Déployer le comportement standard

1. Déployez le backend avec les variables attendues.
2. Vérifiez que le service démarre.
3. Contrôlez les logs auth après mise en production.

### Désactiver la grace window en urgence

1. Modifiez la variable d'environnement :

```bash
AUTH_GRACE_WINDOW_ENABLED=false
```

2. Redémarrez le backend.
3. Surveillez immédiatement les logs et les métriques auth.

## Vérifications

- Le backend démarre sans erreur de validation d'environnement.
- Les doubles refresh légitimes n'entraînent pas de déconnexion massive quand la grace window est active.
- Les relectures hors fenêtre déclenchent bien la révocation attendue.

## Ressources

- Guide auth CI : [`./AUTH_CI_TESTING.md`](./AUTH_CI_TESTING.md)
- Guide d'authentification : [`./authentication.md`](./authentication.md)

Notes :

- La génération et l'accès aux tokens dépendent du backend, de Redis et de Prisma.
- La désactivation d'urgence privilégie la sécurité stricte au confort utilisateur.

## Voir aussi

- [`./AUTH_CI_TESTING.md`](./AUTH_CI_TESTING.md)
- [`./incident_runbook.md`](./incident_runbook.md)
