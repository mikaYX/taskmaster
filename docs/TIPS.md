# Guide express

Ce guide explique les commandes les plus utiles au quotidien pour démarrer Taskmaster, manipuler Prisma et lancer les vérifications de base.

## Contexte

Ce document sert de raccourci pratique. Pour une installation complète, utilisez plutôt le README et le guide de setup.

## Pré-requis

- Avoir installé les dépendances du monorepo.
- Disposer d'un `.env` fonctionnel.
- Savoir depuis quel workspace vous exécutez la commande.

## Étapes

### Démarrer le projet

Depuis la racine :

```bash
npm run dev
```

Ou séparément :

```bash
cd backend
npm run start:dev

cd ../frontend
npm run dev
```

### Utiliser Prisma côté backend

À lancer depuis `backend/` :

```bash
npx prisma migrate dev
npx prisma migrate reset
npx prisma studio
npx prisma generate
```

### Installer ou vérifier rapidement

Depuis la racine :

```bash
npm install
npm run test
npm run typecheck
```

### Lancer des vérifications ciblées

```bash
npm -w backend run test:e2e
npm -w frontend run test
npm -w frontend run check:i18n
```

## Vérifications

- Le frontend répond sur `http://localhost:5173`.
- Le backend répond sur `http://localhost:3000`.
- Swagger est accessible sur `http://localhost:3000/api`.
- Prisma régénère correctement le client après un changement de schéma.

## Ressources

- README : [`../README.md`](../README.md)
- Setup : [`../SETUP.md`](../SETUP.md)
- Base locale : [`./local-db.md`](./local-db.md)

Notes :

- Prisma doit être exécuté depuis `backend/`.
- `npx prisma generate` est une dépendance implicite après modification du schéma ou en cas de types cassés.

## Voir aussi

- [`./i18n-guidelines.md`](./i18n-guidelines.md)
- [`./operations.md`](./operations.md)
