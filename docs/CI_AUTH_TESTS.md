# Guide de lecture des preuves CI auth

Ce guide explique comment lire le workflow de non-régression d'authentification dans GitHub Actions et quels signaux doivent bloquer un merge.

## Contexte

Le workflow d'authentification joue le rôle de garde de sécurité pour les changements qui touchent :

- l'authentification ;
- les sessions ;
- les refresh tokens ;
- les tests backend et frontend liés à ce périmètre.

## Pré-requis

- Avoir accès au dépôt GitHub et aux exécutions Actions.
- Savoir identifier le workflow auth concerné.
- Connaître les checks requis sur les branches protégées.

## Étapes

### Comprendre le workflow

Le workflow exécute successivement :

1. l'installation des dépendances ;
2. le démarrage des dépendances de test ;
3. la suite anti-flaky auth ;
4. les suites backend et frontend attendues.

### Lire les preuves dans GitHub Actions

1. Ouvrez l'onglet Actions.
2. Sélectionnez l'exécution du workflow auth correspondant au commit.
3. Consultez le résumé GitHub et les logs détaillés.
4. Téléchargez les artefacts si vous devez analyser la couverture ou un comportement flaky.

### Identifier les conditions bloquantes

Un merge doit être bloqué si :

- un test échoue ;
- aucun test n'est exécuté ;
- le job anti-flaky révèle une instabilité ;
- le statut requis `auth-tests` n'est pas vert.

### Vérifier la protection de branche

1. Ouvrez les règles de protection de branche sur `main` et `develop`.
2. Vérifiez que le check `auth-tests` est requis.
3. Refusez le merge si ce check est absent ou non vert.

## Vérifications

- Le résumé GitHub affiche les suites backend et frontend.
- Les compteurs de tests sont cohérents et non nuls.
- Les artefacts éventuels sont consultables en cas d'enquête.
- Le check requis apparaît bien dans la protection de branche.

## Ressources

- Complément local et anti-flaky : [`./AUTH_CI_TESTING.md`](./AUTH_CI_TESTING.md)
- Workflows GitHub : [`../.github/workflows`](../.github/workflows)
- README : [`../README.md`](../README.md)

Notes :

- Les protections de branche sont une dépendance implicite de l'efficacité de cette CI.
- L'absence de tests exécutés doit être traitée comme une régression du pipeline elle-même.

## Voir aussi

- [`./go_no_go_checklist.md`](./go_no_go_checklist.md)
- [`./incident_runbook.md`](./incident_runbook.md)
