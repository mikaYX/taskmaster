# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.4] - 2026-08-04

### Fixed
- Setup wizard admin password validation now matches the backend policy (12+ characters, uppercase, lowercase, number, special character) instead of the previous 8-character client-side check, which caused spurious `400 Validation failed` / follow-up `429 Too Many Requests` on first-run setup.

## [1.1.3] - 2026-06-11

### Changed
- Migrated frontend build to **Vite 8** (Rolldown bundler) — faster builds (~1.1s) and better chunk splitting via `rolldownOptions.output.codeSplitting.groups`.
- Bumped frontend dependencies: Radix UI components, Zod 4.4.3, date-fns 4.4.0, date-holidays 3.30.2, NestJS patch group, nodemailer types.

## [1.1.2] - 2026-06-05

### Security
- Fixed **all workspace npm vulnerabilities** (`npm audit --workspaces` and `--omit=dev` now return `0 vulnerabilities`).
- Upgraded vulnerable transitive/runtime dependencies via workspace audit fix:
  - `react-router` / `react-router-dom` to patched `7.17.0` line
  - `protobufjs` to patched `7.6.2`
  - `qs` to patched `6.15.2`
  - `brace-expansion` to patched `5.0.6`
- Added root [SECURITY.md](SECURITY.md) policy and kept backend disclosure guidance in `backend/SECURITY.md`.

### Changed
- Hardened auth/user DTO validation limits to reduce payload abuse surface (`MaxLength` / `ArrayMaxSize` on login, password, API key, passkey and user reset/create DTOs).
- Improved audit fail-safe logging in backend audit service using structured Nest logger output (`[AUDIT_LOG_FAILED] ...`).
- Added auth rate-limit IP allowlist support (`AUTH_LOCKOUT_IP_WHITELIST`) while keeping username-based lockout active.
- Added request timeout handling in frontend HTTP client (`AbortSignal.timeout`) with clean timeout error mapping.
- Added frontend nginx security headers including HSTS, COOP/CORP, Referrer-Policy, nosniff and CSP in Report-Only mode.
- Added frontend lint guard to prevent `_blank` links without `rel`.

### Fixed
- Removed unsafe default fallback credentials from gate/smoke scripts:
  - `backend/seed-gate-user.ts`
  - `scripts/auth-release-gate.ts`
- Moved legacy admin/debug scripts under `backend/scripts/admin/` and added explicit confirmation guards on destructive flows.
- Reworked `scripts/update.sh` to use safe env loading and valid compose-file fallback logic (without `docker-compose.prod.yml`).
- Stopped tracking backend audit/lint/build artifacts and enforced ignores for those outputs.

### Verification
- Typecheck: backend and frontend pass.
- Build: production build passes.
- Tests: no regression vs baseline (existing known failures unchanged: backend ESM `file-type` test harness issue, one frontend auth-settings spec).

## [1.0.2] - 2026-04-05

### Security
- Fixed **28 npm audit vulnerabilities** (1 critical, 19 high, 7 moderate, 1 low)
  - `lodash` upgraded to `4.18.1` (prototype pollution — CVE)
  - `path-to-regexp` overridden to `^8.4.0` (ReDoS)
  - `picomatch` overridden to `^4.0.4` (ReDoS)
  - `flatted` overridden to `^3.4.2`
  - `nodemailer` upgraded to `^8.0.4` in backend

### Fixed
- **13 pre-existing test failures** resolved across the backend test suite:
  - `file-validation.pipe.spec.ts` — virtual mock for ESM-only `file-type` module
  - `notifications.controller.spec.ts` — added missing `JwtAuthGuard` / `RolesGuard` overrides
  - `delegations.controller.spec.ts` — added missing `JwtAuthGuard` / `RolesGuard` overrides
  - `schedule.rbac.spec.ts` — fixed Reflector mock to distinguish `PERMISSIONS_KEY` vs `ROLES_KEY`
  - `tasks.service.spec.ts` — fixed 31-day-ago date calculation (exact ms + `Date.now` mock)
  - `groups.service.spec.ts` — added missing `site.findFirst` to Prisma mock
- **Backend lint** — removed unnecessary escape in `export.service.ts`; fixed relative import path in `roles.guard.ts`
- **Frontend lint** — fixed React hooks violations:
  - `use-version-status.ts` — replaced ref-during-render with `useState` + `useEffect`
  - `login-page.tsx` — moved URL param extraction to `useMemo`, initialise `username` state at declaration to avoid `setState` inside effect
  - `general-settings-page.tsx` — removed synchronous `setState` from FileReader effects
  - `group-members-sheet.tsx` — moved `useMemo` hooks before early-return guard clause

### Changed
- **TypeScript** — added `"ignoreDeprecations": "5.0"` to backend `tsconfig.json` to suppress `moduleResolution: "node"` and `baseUrl` deprecation warnings (migration to `Node16` is blocked by NestJS `emitDecoratorMetadata` + `isolatedModules`)

## [1.0.1] - 2026-03-29

- Fix readme

## [1.0.0] - 2026-03-28

- Initial release: comprehensive security enhancements and architectural improvements
- SVG XSS prevention via magic-byte file upload validation
