# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.10] - 2026-10-19

Feature and security release for 1.1.9. **Three additive database migrations** (`guest_views`, `todo_priority`, `todo_subtasks_recurrence_reminders`) run automatically on start; existing rows keep working. Existing `.env` files are never rewritten on upgrade.

### Added
- Todo list: a task can be edited (title, due date, and the group for collective tasks) from a pencil button next to the delete button; clearing the due date or moving a collective task back to the whole site is supported (`PATCH /todos/:id` accepts `dueDate: null` and now `groupId: null`). The row buttons are always reachable on touch screens and by keyboard instead of appearing only on mouse hover.
- Todo list: a priority (low, normal, high, urgent) shown as a coloured dot and used to sort the list, free-text notes, one level of subtasks with a done/total counter, and recurrence (daily, weekly, monthly: ticking a recurring task creates the next one, with its subtasks unticked, on the next date that is not in the past). Tasks can be searched and filtered by due date (late, today, this week), due dates read "Today", "Tomorrow" or "Late by 2 d", a title is renamed with a double-click, the `n` key jumps to the new-task field, the tabs show how many tasks are open, and "Delete all" empties the ticked tasks of a tab. A ticked collective task shows who ticked it. Database: additive migrations `20261020000000_todo_priority` and `20261020010000_todo_subtasks_recurrence_reminders` (existing tasks become normal priority, no recurrence).
- Todo list: optional email reminders (Settings > General > Add-ons, off by default, needs email sending enabled). An hourly job (`todo-reminders`) sends one digest per person for the tasks due within 24 hours that were not reminded yet: private tasks go to their owner, collective ones to the members of their group (or to their creator when they are for the whole site). A task is reminded once; changing its due date re-arms it, and a failed send is retried.
- Windows MSI remembers where it was installed (`HKLM\SOFTWARE\Taskmaster`: `InstallDir`, `DataDir`). On an upgrade the install-folder page starts on the existing location instead of the default (still editable) and the data folder holding `config\.env` is found again rather than the installation being treated as new. Installs made before this version have no stored value: choose the folder once.
- Guest TV links come in two kinds: a **dashboard** link (the task board, as before) and an **analytics** link (overview and per-task compliance in TV mode, with no per-person tab, no reports and no exports). When creating the links of a site you choose to create one or both; a site holds at most one of each. Each link opens only its own screen: the analytics page was already designed for TV mode but neither the route nor the API allowed a Guest to reach it. Database: a nullable `users.guest_view` column (migration `20261019000000_guest_views`, additive; existing TV accounts become dashboard links).
- Managers get Settings, limited to Security (Users and Groups): no other tab, and no settings API call. On the sites they are attached to, and only there, they can create, edit, reset the password of, delete and restore `USER` and `MANAGER` accounts, manage groups and their members, and manage guest TV links. Users are managed only from Settings > Security (there is no separate "Users" menu entry).
- The users page can list soft-deleted accounts ("Show deleted accounts") so they can be restored. The `includeDeleted` parameter was sent by the interface but ignored by the API, so deleted accounts were never listed.
- Windows MSI: `TASKMASTER_BACKUP_PATH` property to put the backup archives outside `ProgramData` (absolute path or UNC share, created and checked before installing). Blank keeps `ProgramData\Taskmaster\backups`.
- Windows MSI: optional "PostgreSQL bin folder" field (`POSTGRES_BIN_PATH`, written as `PG_BIN_PATH`) so backups find `pg_dump.exe` on the first install. Blank keeps the automatic detection (the installer records the newest local PostgreSQL if one exists); a non-empty folder is checked for `pg_dump.exe`/`pg_restore.exe` before anything is installed.

### Changed
- Collective todos: members of the task's group (anyone, for a task of the whole site) can now tick it, and every role sees the Collective tab. Creating, editing, renaming and deleting stay reserved to managers and above, and a member can change nothing but the checkbox.
- Todo list: ticking a task is instant and rolled back if the server refuses; deleting hides the task for 5 seconds with an "Undo" button before it is really deleted. The ticked section is labelled "last 24 hours", which is what it always showed.

### Security
- Todos: update and delete only looked a task up by its id, so someone on one site could change or delete a collective task of another site by guessing its id; they now answer "not found" for a task outside the caller's site. The group given when creating or editing a task is also checked: it must exist and belong to the site.
- Analytics were not limited by site: every figure (overview, trend, per task, per user, and the CSV/PDF exports built from them) covered all sites whoever asked, so a manager or a user of one site saw the compliance of the others. They are now restricted to the caller's sites (a super administrator still sees everything, or the site they selected), which is also what keeps an analytics TV link to its own site. An account with no site sees nothing.
- A Guest (TV) account could read much more than the board: the user directory with e-mail addresses, groups and their members, analytics (including the CSV/PDF exports), todos, task details and procedure files, and it could call the endpoints that never used `RolesGuard` (push, MFA, passkeys). Protection was "allow by default, exclude per controller". Both authentication guards now refuse a Guest on every route except `GET /auth/session`, `POST /auth/logout`, `GET /tasks/board` and `GET /sites`, matching the route pattern Express resolved (casing or `//`/`..` spellings cannot reach another route). A test walks every controller of the code base and fails if any other route becomes reachable. The Guest role also loses its `USER_READ`, `EXPORT_READ` and `SCHEDULE_READ` permissions, never shows the navigation even outside TV mode, and no longer requests the user and group lists.
- The "Guest TV Links" dialog produced `/login?u=…&p=…` links that the login page has ignored since the URL auto-login was removed (passwords in URLs), while still displaying the password. It now issues a one-time link (`/login?guest_ticket=…`): a 256-bit ticket stored only as a hash, valid once for one screen and for at most 24 hours, replaced by any newer link for that screen, and only able to sign in a live Guest account. Managers can only issue links for the guests of their own sites. "Reset" now also signs the screen out.
- A passkey requirement can no longer lock a TV screen out: no passkey policy applies to Guest accounts.
- A manager could change the groups of other sites: rename or delete them, add or remove their members, read their members, and put any account (administrators, TV accounts, people of other sites) into a group; only moving a group between sites was checked. Every group read and change now requires the group to be on one of the manager's own sites (read from the database, not from the token), and a manager can only add `USER`/`MANAGER` accounts attached to the group's site.
- A manager could act on any account through the API: reset the password of a `SUPER_ADMIN` and sign in as them, or delete, restore and edit administrators and accounts of other sites. Update, delete, restore and password reset now check the target: managers are limited to `USER` and `MANAGER` accounts that share a site with them, and never touch `SUPER_ADMIN` or guest accounts. Creation is restricted to the manager's own sites, and the site is validated before the account is created (a missing site no longer leaves an account without site).
- Guest TV links (list, read, create, regenerate, revoke) are limited to the manager's own sites; a manager could previously regenerate or revoke the link of any site.
- Dependency audit: `npm audit` (production and development, both workspaces) reports 0 vulnerabilities. The last advisory (`braces`, GHSA-vfj7-8cjw-p6xm, no patched release exists) is removed by dropping the packages that pulled it in: `ts-loader` 9.6.2 (uses `picomatch`) and `@types/jest` 30, which aligns the types with the Jest 30 runtime already in use. Development tooling only; nothing shipped in the MSI changes.

### Fixed
- `auth.session.timeout` (Settings > Authentication, "automatic logout after inactivity", 5 to 1440 minutes) was displayed but never read by the server: sessions lasted 7 days whatever it said. It now sets how long a user can stay away before signing in again (the refresh token and its cookie last that long and are renewed on every use). It also applies to sessions opened before the setting was changed, so lowering it takes effect immediately. **The default is 30 minutes** when the setting was never saved: set it to 1440 for a day. TV (Guest) screens keep their one-year session. The precision is the 15-minute lifetime of the access token.
- A deleted account could be offered a password reset and an edit, and the server answered "not found" for them. Deleted accounts now only offer "Restore", and the server says the account is deleted and must be restored first (without revealing it to a manager of another site).
- Every role was signed out each time the 15-minute access token expired when the application was reached through an address missing from `CORS_ORIGIN` (a host name, an IIS/ARR front end, an HTTPS public URL left blank at install). The token refresh and logout go through an origin check that, in production, only accepted `CORS_ORIGIN`; the refusal is a 403, which the browser reads as "session invalid". The check now also accepts same-origin requests (Fetch Metadata `Sec-Fetch-Site`), the address the request was really sent to, and `FRONTEND_URL`/`BACKEND_URL`; cross-site requests, sibling sub-domains and requests without Origin/Referer are still refused (the guard had no test; it now has). A refused origin is logged once with the setting to change.
- Users were signed out early, typically after switching tabs. When two token refreshes overlapped (two tabs, or a retry after a lost response) the second one was answered 401 and the server also deleted the refresh cookie, including the freshly rotated valid one. Such overlaps now answer 409 "refresh in progress" and leave the cookie alone; the grace window for a just-rotated token goes from 10 to 30 seconds (the browser gives up on a refresh after 10). In the browser, a refresh that fails transiently is retried twice and then reported as a 503 instead of re-throwing the original 401, which made the session query sign the user out although the session was intact.
- TV (Guest) sessions last a year, sliding: the refresh token and its cookie are renewed on every rotation (7 days for every other role).
- The new MSI properties `PgBinArg` and `BackupArg` were scheduled before an action that does not exist and would have failed the MSI build; they are now set after `CostFinalize` (verified by compiling the MSI with WiX and reading its tables).
- `BACKUP_STORAGE_PATH` had no effect: the stored `backup.path` setting always has a value (default `./backups`) and was read first, so changing the variable in `.env` changed nothing even though the Backups screen said the folder was configured through it. The variable now comes first, and the screen shows the folder the server really writes to (`GET /backup/status` returns `storagePath`).
- Saving settings no longer stacks one "Settings saved successfully" notification per saved key (up to 12 on the e-mail page and 20+ on exports): the notification has a fixed id, so a single one is shown. Same for the error notification.
- The sidebar shows the user's avatar next to the name instead of always showing initials; the avatar URL resolution is shared with the profile page.
- Account creation and administrative password reset failed about one time in three with `400 Validation failed`: the temporary password was drawn at random without guaranteeing an uppercase letter, a digit and a special character, so the server's policy rejected it. It is now generated with the Web Crypto API and always meets the policy (one shared generator for both dialogs).
- Creating a user now reports failures in the form (previously only visible in the browser console). A username held by a soft-deleted account returns an explicit "restore it" message instead of a bare conflict.

## [1.1.9] - 2026-10-19

Maintenance release for 1.1.8. No database migration. Existing `.env` files are never rewritten on upgrade.

### Added
- Temporary credentials can be emailed when an administrator creates an account or resets a password. A checkbox is offered when email sending is enabled and configured; otherwise the dialog states that email is not active and the temporary password must be handed over directly. The password is still displayed after the operation, with the delivery status (sent, failed, not active, no address).
- Credentials mail is a responsive HTML message (branded header with the application title and, when publicly reachable, the logo; credentials card; sign-in button; security notice; French and English) with a plain-text alternative.
- `GET /users/email-available` tells account managers whether credentials can be emailed (the settings endpoint is restricted to super administrators).
- Windows MSI: "offline mode" option in the configuration dialog and `TASKMASTER_OFFLINE_MODE` property. The default is unchanged (`OFFLINE_MODE=true`, no outbound update check); clearing it writes `OFFLINE_MODE=false` on a fresh install.

### Fixed
- The Windows MSI 1.1.8 (and, since the staged copy was not refreshed, likely earlier builds) shipped a stale frontend from 2 September, so the forced password-change prompt, the role-based menu and other fixes were missing from the installed application. `npm run build` now refreshes `client/` again, and `installer/build.ps1` refuses to package a `client/` that differs from `frontend/dist`.
- Todo list page redirected non-administrators to the board because it read the add-on flag from the super-administrator-only settings endpoint; it now uses the public allowlist like the menu.
- Update status no longer reads "Up to date" when no check could be performed; it shows "Unknown".
- Backups on Windows: `pg_dump`/`pg_restore` are located automatically under `%ProgramFiles%\PostgreSQL` when `PG_BIN_PATH` is empty (the MSI never set it), and archive extraction always uses the system `tar.exe` so a GNU `tar` earlier in `PATH` cannot misread `C:\` paths.

### Verification
- Backend: 614 passing tests (the five backup round-trip failures of the previous working tree are fixed); frontend: 114 passing tests; lint clean.
- Browser (Playwright) scenarios and the MSI installation screen change were not re-run for this release; validate the configuration dialog and a credentials email on the Windows candidate before deployment.

## [1.1.8] - 2026-10-17

Bugfix release for 1.1.7. No database migration or configuration change.

### Fixed
- Administrative password resets and completed logins invalidate cached sessions so the forced password-change prompt reflects the current account state.
- Legacy cached sessions without the renewal flag are rebuilt; session refresh on window focus preserves authenticated screens during transient network failures.
- Password changes remain available before required passkey enrollment; the current password is still verified by the server.
- The `Quality and regression checks` CI workflow is valid again: `TASKMASTER_DATA_DIR` for the Windows backup job is set at step level, where the `runner` context is available.

### Verification
- Backend: 594 passing tests; frontend: 114 passing tests; operational board, profile, passkeys, password renewal and navigation: 25 passing browser scenarios.
- Windows MSI built on Windows Server 2019 x64 with the installer build script (typecheck and tests included).

## [1.1.7] - 2026-10-16

### Added
- Optional execution checklists, private photo evidence, and corrective actions tied to task occurrences.
- Saved board views scoped to the browser, account and site, plus compact board density.
- Corrective action search, assignee/overdue filters, and server pagination.
- Self-service display-name updates and the actual MFA state in the profile.
- Windows MSI public-URL input and a non-destructive installation verification script.
- Interactive local PostgreSQL reset utility for Windows administration, with explicit confirmation and optional backup; execution remains a manual administrative operation.
- Regression workflows for Windows backups, browser access, PostgreSQL execution, legacy migration and native backup/restore; manual Windows MSI candidate build.

### Security
- Password changes require the current password and reject reuse of that password; the client displays the shared password requirements.
- Accounts marked for password renewal are prompted before passkey onboarding and normal application use.
- Execution evidence stays private and scoped to the task, occurrence, user and site; corrective action filters retain server-side access checks.
- The Windows service wrapper download is checked against a pinned SHA-256 instead of an optional placeholder.
- Dependency audit: `npm audit --omit=dev` reports 0 vulnerabilities. Upgraded `nodemailer` to 10.1.2 and NestJS core packages to 11.2.7; pinned patched `proxy-addr`, `shell-quote`, `handlebars`, `undici`, `@grpc/grpc-js`, `fast-uri`, `multer`, `brace-expansion`, `js-yaml`, `moment`, `source-map-js` and `fast-copy`. The only remaining advisory (`braces`, GHSA-vfj7-8cjw-p6xm) affects development tooling only and has no patched release yet.

### Fixed
- Windows service backups resolve PostgreSQL tools and data paths explicitly, await closed file handles and publish completed archives atomically.
- Manual backup success is displayed only after the background job finishes; full backups include procedures and private evidence.
- Restore rejects archives with a missing or empty database dump before copying application artifacts.
- Passkeys derive the RP domain from the configured public frontend URL unless a compatible explicit RP ID is provided.
- Application branding uses only public settings and resets cleared cached values; administration navigation matches server access rules.
- Existing configuration and the public shortcut URL are preserved on installer upgrades.

### Deployment
- Apply the additive `20261016000000_task_execution` migration after a verified backup. Existing tasks default to an empty checklist.
- Existing installations must configure `FRONTEND_URL` with their own public HTTPS origin. Remove or correct an incompatible `RP_ID=localhost`, then restart the service; upgrades preserve the existing `.env`.
- Windows MSI build/installation, actual service-account backup/restore and browser passkey acceptance will be validated separately on a Windows machine before production deployment; see `docs/windows-release-checklist.md`.

### Verification
- Backend: 590 passing tests; frontend: 111 passing tests; operational board, profile, passkeys and navigation: 23 passing browser scenarios.
- Isolated PostgreSQL: 6 execution/access tests and 3 legacy-migration/native dump-and-restore tests passed. The upgrade scenario uses the installer’s `prisma migrate deploy` command and verifies preserved data and restored artifacts.
- Typecheck, lint and production application build passed. Existing frontend bundle-size and mixed-import warnings remain.
- Windows scripts and workflow syntax checked locally; no MSI build or Windows acceptance result is claimed from the Linux development environment.

## [1.1.6] - 2026-09-28

### Security
- Resolved the 12 vulnerable dependencies reported by the September 28 npm audit (5 high, 6 moderate, 1 low) using targeted updates within the existing major versions.
- Updated Multer to `2.3.0`, SimpleWebAuthn server to `13.3.3`, Nodemailer to `9.1.1`, and Vitest/coverage to `4.1.11`.
- Updated transitive dependencies and root overrides for `@humanfs/node`, `@xmldom/xmldom`, `fast-uri`, `js-yaml`, and `qs`; regenerated the workspace lockfile.

### Fixed
- Installer upgrades now reuse the existing configuration: `orchestrate-install.ps1` detects a previous install via its `.env` and keeps the real `DATABASE_URL`, `REDIS_URL` and `PORT` instead of rebuilding them from the MSI defaults (which previously pointed `prisma migrate deploy` at the wrong database). The PostgreSQL role/database creation step is skipped on upgrade.
- The MSI wizard skips `TaskmasterConfigDlg` on upgrade (`WIX_UPGRADE_DETECTED`).
- Start Menu shortcut: WiX's `CreateShortcuts` stalled for ~60 s and never wrote `Taskmaster.lnk` for an `http://` target. The installer now writes a plain `Taskmaster.url` itself (with the resolved port), and a new `CleanupStartMenuFolder` action removes it on uninstall so the folder is deleted.
- Shortcut component key path moved from `HKCU` to `HKMU` to match the per-machine install scope.

### Verification
- Clean workspace installation from the lockfile and Prisma client generation: pass.
- Full and production-only npm audits: `0 vulnerabilities`; dependency tree: valid.
- Tests: backend `516/516`, frontend `93/93`; real Multer upload and file-size limit smoke checks: pass.
- Lint: `0 warnings`, `0 errors`; typecheck and production build: pass (existing Vite bundle-size and dynamic-import warnings remain).

## [1.1.5] - 2026-09-02

### Security
- Updated direct and transitive npm dependencies across the root, backend, and frontend workspaces; all production and development audits now report `0 vulnerabilities`.
- Upgraded security-sensitive packages including Axios, FormData, Multer, Nodemailer, ProtobufJS, React Router, Undici, and WebSocket dependencies to patched releases.

### Changed
- Cleared the existing lint backlog across the backend and frontend without disabling the underlying rules; both workspaces now lint with `0 warnings` and `0 errors`.
- Updated frontend WebAuthn calls for the SimpleWebAuthn v13 API and tightened types across authentication, settings, schedules, tasks, and shared API code.
- Updated Puppeteer integration for the current ESM-compatible release while preserving lazy loading of the analytics PDF renderer.

### Fixed
- Reworked file upload type detection behind an injectable ESM loader, fixing the seven Jest failures caused by `file-type` without changing production magic-byte validation.
- Updated affected tests and mocks for current dependency APIs; the complete backend and frontend test suites now pass.

### Verification
- NPM audit: `0 vulnerabilities`.
- Lint: `0 warnings`, `0 errors`.
- Typecheck and production build: pass.
- Tests: backend `516/516`; frontend `93/93`.
- Production `file-type` loader smoke test: pass.

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
