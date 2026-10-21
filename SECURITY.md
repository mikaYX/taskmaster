# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.2.x | ✅ |
| < 1.2 | ❌ |

Only the latest minor version receives security fixes. Update before reporting an issue found on an older version.

## Report a vulnerability

Please **do not open a public issue** for a vulnerability. Instead:

1. Use **GitHub Security Advisories**: the *Security* tab of the repository, then *Report a vulnerability*.
2. Or contact the maintainer privately through the email address on their GitHub profile.

Include:
- a description of the problem and the affected file or module;
- steps to reproduce, ideally a minimal one;
- the estimated impact (CVSS if relevant);
- the version and any specific configuration.

What to expect:
- an acknowledgement within **5 working days**;
- an assessment and a fix plan within **15 working days**;
- a coordinated advisory once the fix is released.

## Scope

In scope:
- the NestJS backend (`backend/`): authentication, authorization, validation, audit;
- the React frontend (`frontend/`): XSS, session handling, data exposure;
- the Docker image and Compose files, the Windows installer (`installer/`) and the scripts (`scripts/`);
- the direct dependencies listed in the `package.json` files.

Out of scope:
- attacks that need physical access to the server or its secrets;
- third-party dependencies with a public advisory not yet fixed upstream (report them to their maintainers);
- denial of service by network flooding.

## Security controls

| Area | Controls |
| --- | --- |
| Sessions | 15-minute access token and 7-day refresh token, both in `HttpOnly` cookies. Each refresh rotates the token, and reusing a revoked one revokes its whole family. Renewals are refused from untrusted origins (CSRF). |
| Sign-in | bcrypt password hashes, TOTP MFA, passkeys (WebAuthn), MFA and passkey requirements per role, rate limits and a progressive lockout per account and per IP ([details](docs/authentication.md#protection-against-brute-force)) |
| Authorization | Roles (super admin, manager, user, guest) and permissions checked on the server. Data is filtered by site. Guest accounts can only reach an allowlist of read-only endpoints. API keys are hashed (SHA-256) and limited by scopes and site. |
| Input | Global validation: unknown fields are rejected. Every setting is checked against its own schema. Outbound URLs (OIDC issuers, notification channels) are checked against private addresses (SSRF). |
| HTTP | Helmet security headers, with a Content-Security-Policy in production. Error responses carry no stack trace in production. |
| Data | Sensitive settings encrypted at rest (AES-256-GCM, key derived from `AUTH_SECRET`). Backups encrypted (AES-256-GCM) and signed (HMAC) with `BACKUP_ENCRYPTION_KEY`. Photo evidence is only downloadable with access to its task. |
| Privacy | IPs anonymized before storage, retention jobs for audit logs and sessions ([details](docs/operations.md#privacy-and-retention)) |
| Audit | Security and business actions are written to the audit log, visible to super admins |
| Supply chain | CodeQL and a Trivy scan of the Docker image in CI, with reviewed and expiring exceptions in [`security/trivy-exceptions.json`](security/trivy-exceptions.json). The image runs as a non-root user. |

## Deployment checklist

- Generate long random values for `AUTH_SECRET`, `BOOTSTRAP_SECRET` and `BACKUP_ENCRYPTION_KEY`, and keep a copy of the backup key outside the server.
- Serve Taskmaster over HTTPS only, and set `CORS_ORIGIN`, `FRONTEND_URL` and `BACKEND_URL` to that address.
- Behind a reverse proxy, set `TRUST_PROXY`.
- Do not expose PostgreSQL, Redis or `/api/metrics` to the Internet.
- Require MFA or passkeys for super admins, and keep one local super admin as a fallback for SSO outages.
