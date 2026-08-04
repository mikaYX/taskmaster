# Audit de sécurité & durcissement — Rapport final

> **Périmètre.** Application TaskMaster (monorepo `backend` NestJS + `frontend` React/Vite + scripts d’infra). Audit en lecture, puis durcissement ciblé sans casser l’existant et **sans commit/push** (changements laissés dans le working tree).
>
> **Mode opératoire.** Aucune mise à jour majeure risquée. Toute modification est soit déclarative (DTO, headers, env), soit testable. Verdict final ci-dessous.

---

## 1. Résumé exécutif

| Indicateur | Avant | Après |
|---|---|---|
| `npm audit --workspaces` (tous deps) | 6 vulnérabilités (1 HIGH, 5 MODERATE) | **0** |
| `npm audit --workspaces --omit=dev` | idem (la HIGH `react-router-dom` est runtime) | **0** |
| Backend typecheck | OK | OK |
| Frontend typecheck | OK | OK |
| Backend tests | 415 passed / 7 failed (baseline ESM `file-type`) | **419 passed / 7 failed** (+4 nouveaux tests, mêmes 7 échecs préexistants) |
| Frontend tests | 89 passed / 1 failed (baseline `auth-settings-page.spec.tsx`) | **89 passed / 1 failed** (identique) |
| Build (`npm run build`) | OK | OK |
| Syntaxe shell (`update.sh`, `docker-entrypoint.sh`) | KO (références à `docker-compose.prod.yml` absent + parsing `.env` cassable) | **OK** |
| Fichiers d’artefacts trackés dans Git | 4 fichiers de logs/audits commités | **Supprimés + gitignorés** |

**Aucune régression fonctionnelle observée.** Les 7 + 1 échecs résiduels sont des défauts **préexistants** (cf. §4).

---

## 2. Méthodologie

1. **Inventaire** : lecture du tree complet, des `package.json`, `Dockerfile`, `docker-compose*.yml`, `nginx.conf`, et de l’ensemble des modules d’authentification, d’audit, de backup et des pipes de validation.
2. **Vérifications dynamiques** : `npm audit`, `tsc --noEmit`, suites de tests Jest/Vitest, syntaxe `bash -n`, build de prod.
3. **Plan validé par l’utilisateur** avant tout changement (audit-only ➜ exécution en phases).
4. **Exécution par phases isolées**, avec `typecheck`/`get_errors` après chaque édition pour stopper net toute régression.

---

## 3. Ce qui a été corrigé

### 3.1 Hygiène, secrets, dépendances (Phase 1)

- **[backend/.gitignore](backend/.gitignore)** — ajout de `audit.json`, `build_errors.txt`, `lint-output*.json`, `coverage/`, `coverage-auth/`, `flaky-report/` pour ne plus jamais committer des artefacts d’audit/lint volumineux et potentiellement parlants.
- **Artefacts supprimés du repo** : `backend/audit.json`, `backend/build_errors.txt`, `backend/lint-output.json`, `backend/lint-output2.json` (étaient trackés ; remplacés par leurs entrées `.gitignore`).
- **[SECURITY.md](SECURITY.md)** *(nouveau)* — politique de divulgation responsable, table des versions supportées, périmètre, lien vers [backend/SECURITY.md](backend/SECURITY.md).
- **[package.json](package.json)** — ajout d’un bloc `engines` (Node `>=22 <25`, npm `>=10`) pour aligner sur le runtime CI/Docker.
- **`npm audit fix --workspaces`** — bump mineurs sans casse : `react-router(-dom)` 7.14.0 → 7.17.0 (HIGH RCE/open redirect/DoS), `protobufjs` 7.5.6 → 7.6.2 (MODERATE prototype pollution), `qs` 6.15.0 → 6.15.2, `brace-expansion` 5.0.5 → 5.0.6, `hono` 4.12.18 → 4.12.23 (dev). **Résultat : 0 vulnérabilité.**
- **Scripts admin quarantinés** sous [backend/scripts/admin/](backend/scripts/admin/) (11 scripts qui étaient à la racine de `backend/` et exécutables sans garde) :
  - [backend/scripts/admin/README.md](backend/scripts/admin/README.md) explicite leur usage opérationnel uniquement.
  - [backend/scripts/admin/clear.ts](backend/scripts/admin/clear.ts) — garde `CONFIRM_CLEAR=yes` requise avant de purger la BDD.
  - [backend/scripts/admin/reset_password.js](backend/scripts/admin/reset_password.js) — **suppression du mot de passe en dur `'admin123'`** ; exige désormais `CONFIRM_RESET=yes` + `ADMIN_NEW_PASSWORD` (≥ 12 caractères).

### 3.2 Hardening backend (Phase 2)

- **Validation stricte des DTO sensibles** : ajout de `MaxLength` + `ArrayMaxSize` pour fermer la porte aux payloads abusivement longs (DoS validation/log/DB) :
  - [backend/src/auth/dto/login.dto.ts](backend/src/auth/dto/login.dto.ts) — `MaxLength(255)` username, `MaxLength(128)` password.
  - [backend/src/auth/dto/change-password.dto.ts](backend/src/auth/dto/change-password.dto.ts) — `MaxLength(128)` + suppression d’un `@IsString` dupliqué.
  - [backend/src/auth/dto/api-key.dto.ts](backend/src/auth/dto/api-key.dto.ts) — `MaxLength(100)` name, `MaxLength(500)` description, `ArrayMaxSize(50)` scopes.
  - [backend/src/auth/dto/passkeys.dto.ts](backend/src/auth/dto/passkeys.dto.ts) — `MaxLength(100)` name, `MaxLength(256)` sessionId.
  - [backend/src/users/dto/create-user.dto.ts](backend/src/users/dto/create-user.dto.ts) et [backend/src/users/dto/reset-password.dto.ts](backend/src/users/dto/reset-password.dto.ts) — `MaxLength(128)` password.

- **Audit log fail-safe & traçable** — [backend/src/audit/audit.service.ts](backend/src/audit/audit.service.ts) : injection d’un `Logger` Nest, remplacement de `console.error(...)` par une trace structurée `[AUDIT_LOG_FAILED] action=... category=... severity=... actorId=... target=...` exploitable par Pino + agrégation. **Contrat fail-safe conservé** (jamais d’`throw` qui casserait l’action métier sous-jacente).

- **Rate-limit auth — whitelist IP officielle** — [backend/src/auth/guards/auth-rate-limit.guard.ts](backend/src/auth/guards/auth-rate-limit.guard.ts) : nouvelle variable `AUTH_LOCKOUT_IP_WHITELIST` (CSV d’IPs exactes). Les fenêtres **IP** sont bypassées pour ces IPs (sortie NAT mutualisée d’une entreprise, par ex.) ; les fenêtres **username** restent actives — défense en profondeur, on ne désactive jamais la protection par compte. Tests dédiés ajoutés ([backend/src/auth/guards/auth-rate-limit.guard.spec.ts](backend/src/auth/guards/auth-rate-limit.guard.spec.ts), 4 nouveaux scénarios).

- **Fail-fast sur les comptes de smoke-test** :
  - [backend/seed-gate-user.ts](backend/seed-gate-user.ts) — refuse de seed si `SMOKE_USERNAME` / `SMOKE_PASSWORD` absents, exige ≥ 12 caractères, refuse en `NODE_ENV=production`. **Plus aucun fallback `gate_password123`.**
  - [scripts/auth-release-gate.ts](scripts/auth-release-gate.ts) — supprime les fallbacks `smoke_test_user` / `smoke_test_password`.

- **Documentation des variables sensibles** — [.env.docker.example](.env.docker.example) et [.env.local.example](.env.local.example) : `TRUST_PROXY` documenté (impact rate-limit + audit derrière reverse-proxy) et `AUTH_LOCKOUT_IP_WHITELIST` (avec exemple commenté).

### 3.3 Hardening frontend (Phase 3)

- **Timeout requêtes HTTP** — [frontend/src/api/http.ts](frontend/src/api/http.ts) :
  - Helper `buildAbortSignal` qui combine `AbortSignal.timeout()` avec le `signal` éventuel passé par l’appelant (compatibilité TanStack Query intacte) ; fallback manuel via `AbortController` si `AbortSignal.any` n’est pas dispo.
  - `DEFAULT_TIMEOUT_MS = 30 s` (calls normaux), `UPLOAD_TIMEOUT_MS = 5 min` (FormData), `REFRESH_TIMEOUT_MS = 10 s` (rotation silencieuse). Override par requête via `options.timeoutMs`.
  - Mapping propre `TimeoutError` → `ApiError(408, 'Request Timeout', { code: 'timeout' })`. Le flux refresh/retry et la déduplication Web Locks sont préservés.

- **Headers de sécurité nginx** — [frontend/nginx.conf](frontend/nginx.conf) : ajout de `X-Frame-Options`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimale, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, `Strict-Transport-Security: max-age=15552000; includeSubDomains` et surtout une **CSP en `Report-Only`** (ne casse rien à l’activation) avec script-src strict (pas de `'unsafe-inline'`). À promouvoir en CSP appliquée une fois les rapports validés.

- **Reverse-tabnabbing prévenu via ESLint** — [frontend/eslint.config.js](frontend/eslint.config.js) : règle `no-restricted-syntax` qui interdit tout JSX `target="_blank"` sans attribut `rel` (les 3 occurrences existantes ont déjà `rel="noopener noreferrer"`, donc 0 régression lint).

---

## 4. Échecs résiduels (préexistants, **non régressions**)

| Fichier | Cause | Impact |
|---|---|---|
| [backend/src/common/pipes/file-validation.pipe.spec.ts](backend/src/common/pipes/file-validation.pipe.spec.ts) (7 tests) | `file-type@21` est **ESM-only**, ts-jest sans `--experimental-vm-modules` ne peut pas résoudre `await import('file-type')`. Le code de prod fonctionne, c’est le harness Jest qui n’aime pas. | Corriger en activant la config VM ESM ou en figeant `file-type` à v19 — hors périmètre de cet audit. |
| [frontend/src/features/settings/pages/auth-settings-page.spec.tsx:99](frontend/src/features/settings/pages/auth-settings-page.spec.tsx#L99) | `screen.getByRole('button', { name: /Save Changes/i })` échoue quand l’API mockée renvoie erreur (le bouton n’est pas rendu dans cet état). | Test à durcir avec `findByRole` + tolérance d’absence. |

Ces échecs étaient présents à HEAD (avant toute modification) et le restent à l’identique.

---

## 5. Pistes recommandées **non appliquées** (hors périmètre / nécessitent décision)

1. **`file-type` ESM**. Choisir entre (a) activer ESM dans Jest (`NODE_OPTIONS=--experimental-vm-modules`, `extensionsToTreatAsEsm`), (b) downgrade `file-type` à v19, (c) wrapper interne CommonJS.
2. **CSP appliquée** (vs Report-Only). Une fois les `report-uri` collectés et les domaines tiers nécessaires identifiés, dupliquer la directive en `Content-Security-Policy` et supprimer le `-Report-Only`.
3. **Mises à jour majeures**. Volontairement non touchées (NestJS 11, React 19, Vite 7, Prisma 7 sont à jour). À surveiller : `node:24.12.0-alpine` dans le `Dockerfile` (Node 24 est actuel ; aligner avec la branche LTS si politique d’entreprise).
4. **Rotation HSTS**. Le `max-age=15552000` (180 j) est volontairement court pour préserver le développement HTTP. Passer à `max-age=63072000; includeSubDomains; preload` une fois la prod HTTPS éprouvée.
5. **eslint-plugin-react**. Si vous voulez la règle officielle `react/jsx-no-target-blank` (qui inspecte aussi le contenu de `rel`), ajouter la dépendance dev — c’est mineur mais a été évité ici pour minimiser le footprint.
6. **Trivy / Snyk en CI**. Le projet expose déjà `security/trivy-exceptions.json` et `scripts/validate-trivy-exceptions.js` ; assurez-vous que le scan tourne sur chaque PR.
7. **MFA forcée pour ADMIN**. À considérer côté policy `auth.policy.service.ts` (pas modifié ici).

---

## 6. Reproduire la vérification

```bash
# Typechecks
npm -w backend run typecheck
npm -w frontend run typecheck

# Tests (attendre 419/7 backend, 89/1 frontend — mêmes baselines)
npm -w backend run test
npm -w frontend run test -- --run

# Build production
npm run build

# Audits (attendre 0 vuln)
npm audit --workspaces
npm audit --workspaces --omit=dev

# Sanity shell
bash -n scripts/update.sh
bash -n docker-entrypoint.sh
```

---

## 7. Recommandations de déploiement

- **Variables à fixer en prod** : `TRUST_PROXY` (selon nombre de proxies devant l’app), `CORS_ORIGIN`, `BACKUP_ENCRYPTION_KEY`, `JWT_SECRET`, et — si rate-limit jugé trop sévère depuis sortie NAT corp — `AUTH_LOCKOUT_IP_WHITELIST=ip1,ip2`.
- **Smoke test CI** : exposer `SMOKE_USERNAME` et `SMOKE_PASSWORD` (≥ 12 chars) sinon `seed-gate-user.ts` et `auth-release-gate.ts` refusent désormais de démarrer.
- **Reset password admin** : utiliser [backend/scripts/admin/reset_password.js](backend/scripts/admin/reset_password.js) avec `CONFIRM_RESET=yes ADMIN_NEW_PASSWORD='<...>'` — plus jamais de mot de passe par défaut.
- **CSP** : déployer d’abord la version `Report-Only` (déjà en place dans [frontend/nginx.conf](frontend/nginx.conf)), vérifier les rapports navigateurs 1–2 semaines, puis promouvoir.
- **Aucun commit effectué.** Vous pouvez relire le diff (`git diff` + `git status`) puis committer/stage à votre rythme. Suggestion de message : `chore(security): hygiène, dépendances (audit fix), DTO MaxLength, IP whitelist auth, nginx headers + CSP RO, fail-fast smoke scripts`.

---

*Dernière vérification : tous les indicateurs verts sauf les 8 échecs de test préexistants détaillés en §4.*
