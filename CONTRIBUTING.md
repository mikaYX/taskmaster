# Contributing

Thanks for your interest in Taskmaster! Bug reports, fixes, features, translations, documentation and tests are all welcome.

## Before you start

- **Bugs**: open an issue with the steps to reproduce, the expected and actual behavior, and your version and installation type (Docker, source, Windows).
- **Features**: open an issue first to discuss the need and the approach before writing code.
- **Security issues**: never in a public issue. See [SECURITY.md](SECURITY.md).

## Development setup

Follow [Run from source](docs/getting-started.md#run-from-source). In short:

```bash
npm install
cp .env.local.example .env
docker compose -f docker-compose.local-db.yml up -d
cd backend && npx prisma migrate deploy && cd ..
npm run dev
```

The repository is an npm workspaces monorepo:

| Folder | Content |
| --- | --- |
| `backend/` | NestJS API, Prisma schema and migrations (`backend/prisma/`) |
| `frontend/` | React 19 + Vite application, translations in `frontend/src/locales/` |
| `installer/` | Windows MSI (WiX and PowerShell) |
| `scripts/` | Build, release and documentation scripts |
| `docs/` | Documentation |

## Checks

Run these before opening a pull request. The CI runs them too.

```bash
npm run lint
npm run typecheck
npm test
npm -w frontend run check:i18n
```

### End-to-end tests

`npm run test:e2e` starts the API against a real PostgreSQL and **deletes data**. Never point it at a database you care about. Use a throwaway one:

```bash
docker run -d --rm --name taskmaster-e2e -e POSTGRES_USER=taskmaster -e POSTGRES_PASSWORD=e2e \
  -e POSTGRES_DB=taskmaster_e2e -p 55432:5432 postgres:18-alpine
export DATABASE_URL=postgresql://taskmaster:e2e@localhost:55432/taskmaster_e2e
(cd backend && npx prisma migrate deploy)
npm run test:e2e
```

The suites run one after the other because they share that database.

The PostgreSQL-specific suites each need their own explicit database URL:

| Command | Variable |
| --- | --- |
| `npm -w backend run test:execution:postgres` | `TASKMASTER_EXECUTION_TEST_DATABASE_URL` |
| `npm -w backend run test:todos:postgres` | `TASKMASTER_TODOS_TEST_DATABASE_URL` |
| `npm -w backend run test:upgrade:postgres` | `TASKMASTER_UPGRADE_TEST_DATABASE_URL` |

## Guidelines

- **Database changes**: edit `backend/prisma/schema.prisma`, then create a migration with `npx prisma migrate dev --name <change>` in `backend/`. Migrations must not lose existing data.
- **User-facing text**: never hard-code it. Add the key to both `en.json` and `fr.json`.
- **Tests**: add or update tests with your change: Jest for the backend, Vitest and Testing Library for the frontend.
- **Changelog**: describe user-visible changes under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).
- **Screenshots**: `npm run docs:screenshots` regenerates the README images. Read its header first: it needs a throwaway instance.

## Commits and pull requests

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat(analytics): add the per-site ranking
fix(backup): keep the archive when retention fails
docs: explain the passkey domain
```

Common types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `chore`. The scope is the area changed.

Pull requests:
- target `main` and stay focused on one change;
- explain what changes and why, and how you tested it;
- update the documentation when behavior or configuration changes.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
