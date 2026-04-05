# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
