# Guide des tests auth en CI

Ce guide explique comment exécuter et interpréter la suite de non-régression d'authentification, en local comme dans la CI.

## Contexte

La suite cible principalement la robustesse du flux de session autour des refresh tokens, de la fenêtre de grâce et des tentatives de rejeu.

## Pré-requis

- Disposer d'un `.env` racine compatible avec PostgreSQL et Redis.
- Avoir installé les dépendances du backend.
- Exécuter les commandes depuis `backend/` ou via `npm -w backend`.

## Étapes

### Comprendre les scénarios couverts

Le scénario E2E principal couvre :

1. la connexion initiale et l'émission des jetons ;
2. un refresh valide ;
3. une course concurrente dans la fenêtre de grâce ;
4. une tentative de rejeu hors fenêtre qui doit déclencher la révocation attendue.

Le point d'entrée principal est `backend/test/auth-flow.e2e-spec.ts`.

### Lancer la suite localement

```bash
cd backend
npm run test:auth:ci
```

Points à retenir :

- le script s'appuie sur Prisma et Redis ;
- le backend crée des données de test isolées ;
- l'échec du test doit être traité comme un blocage de livraison sur l'authentification.

### Lire la version CI

La CI démarre des services éphémères, initialise le schéma puis exécute la suite auth.

Les preuves utiles sont :

1. le statut du job GitHub Actions ;
2. le rapport de couverture auth ;
3. le rapport anti-flaky si la répétition détecte une instabilité.

### Comprendre la politique anti-flaky

La commande `test:auth:flaky` relance plusieurs fois la même suite :

- si tous les runs passent, la suite est considérée déterministe ;
- si tous échouent, le problème est reproductible ;
- si le résultat varie, la CI bloque volontairement le merge.

## Vérifications

- `npm run test:auth:ci` passe localement.
- Les rapports CI montrent bien les artefacts attendus.
- Aucun comportement flaky n'est toléré sur la suite auth.

## Ressources

- Script backend : [`../backend/package.json`](../backend/package.json)
- Tests E2E auth : [`../backend/test`](../backend/test)
- Workflows CI : [`../.github/workflows`](../.github/workflows)

Notes :

- Prisma et Redis sont des dépendances implicites de cette suite.
- Les artefacts de couverture aident à confirmer qu'une régression n'a pas déplacé le code hors du périmètre testé.

## Voir aussi

- [`./CI_AUTH_TESTS.md`](./CI_AUTH_TESTS.md)
- [`../README.md`](../README.md)
