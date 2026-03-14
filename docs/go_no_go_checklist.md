# Checklist go/no-go

Ce guide explique quels critères vérifier avant de valider un passage en préparation de release ou en production.

## Contexte

Cette checklist consolide les signaux attendus sur la sécurité, la stabilité, l'exploitation et la scalabilité avant décision.

## Pré-requis

- Disposer des résultats de build, de test et de vérification Docker.
- Avoir relu les guides `operations.md`, `troubleshooting.md` et les rapports de sécurité concernés.
- Avoir un responsable identifié pour la décision finale.

## Étapes

### Sécurité

- [x] `npm audit` ne remonte pas de vulnérabilité critique connue.
- [x] Le durcissement de l'authentification est validé.
- [x] Les restrictions RBAC sont revues sur les routes sensibles.
- [x] Les secrets de production sont validés au démarrage.
- [x] `Helmet` et `CORS` sont configurés.

### Scalabilité et traitements asynchrones

- [x] Les sauvegardes asynchrones sont vérifiées.
- [x] Redis et BullMQ sont opérationnels.
- [x] Les optimisations de calcul des tâches sont en place.

### Stabilité et fiabilité

- [x] Les contrats API attendus par le frontend sont alignés.
- [x] Les conteneurs Docker principaux restent stables.
- [x] La logique de fuseau horaire est vérifiée.

### Exploitation

- [ ] Le déploiement de production est validé sur `docker-compose.prod.yml`.
- [ ] Les guides d'exploitation et de dépannage sont à jour.

## Vérifications

- La décision de passage est explicitement documentée.
- Les éléments bloquants restants sont listés et datés.
- La décision finale distingue bien `GO release` et `GO trafic production`.

## Ressources

- Exploitation : [`./operations.md`](./operations.md)
- Dépannage : [`./troubleshooting.md`](./troubleshooting.md)
- Build Docker : [`./DOCKER-BUILD.md`](./DOCKER-BUILD.md)

Notes :

- Cette checklist ne remplace pas les validations de sécurité détaillées.
- Elle sert de synthèse pour une décision rapide et traçable.

## Prochaines étapes

- Si tous les critères sont validés, préparer la release en vous appuyant sur [`./DOCKER-BUILD.md`](./DOCKER-BUILD.md) et [`./operations.md`](./operations.md).
- Si un critère critique échoue, ouvrir un plan de correction avant nouvelle revue.
