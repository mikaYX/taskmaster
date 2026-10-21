# Authentication

Taskmaster supports local accounts and several single sign-on (SSO) methods. All of them are configured by a super administrator in **Settings → Authentication**, except the public URLs, which come from environment variables.

| Method | Typical use |
| --- | --- |
| Local accounts | Built-in accounts with a password. Keep at least one as a fallback when SSO is unavailable. |
| LDAP | Active Directory or another directory |
| Azure AD / Microsoft Entra ID | Microsoft 365 organizations |
| Google Workspace | Google accounts, optionally limited to one domain |
| Generic OIDC | Keycloak, Auth0, Okta or any OpenID Connect provider |
| Generic SAML 2.0 | Enterprise SSO that requires SAML |

Taskmaster has one generic provider, set to either OIDC or SAML.

On top of any method: TOTP multi-factor authentication (MFA), passkeys (WebAuthn), and per-role requirements for both.

## Roles

| Role | Can |
| --- | --- |
| Super Admin | Everything: settings, sign-in methods, backups, sites, task deletion and the audit log |
| Manager | Create and edit tasks and schedules, manage the users of their sites (Settings shows them only the users part), see the analytics |
| User | Validate and report their tasks, view the task definitions, use the Todo module |
| Guest | A read-only wall screen (task board or analytics) of one site, opened through a guest link |

Guest accounts are created from **Settings → Security → Guest TV Links**, one link per site and per screen. A guest can only call the endpoints its screen needs.

## Public URLs

SSO providers redirect the browser back to Taskmaster, so the public addresses must be set in `.env`:

| Variable | Example |
| --- | --- |
| `BACKEND_URL` | `https://taskmaster.example.com` |
| `FRONTEND_URL` | `https://taskmaster.example.com` |
| `CORS_ORIGIN` | `https://taskmaster.example.com` |

With the single Docker image, all three are the same address. Taskmaster sends these redirect (callback) URLs to the provider. Register them exactly as shown:

| Provider | Callback URL sent by Taskmaster |
| --- | --- |
| Google | `<BACKEND_URL>/auth/external/callback/google` |
| Generic OIDC | `<BACKEND_URL>/auth/external/callback/generic` |
| Azure AD | `<BACKEND_URL>/auth/azure/callback` |
| SAML (ACS) | `<BACKEND_URL>/auth/saml/acs` |

The SAML service provider metadata is served at `/api/auth/saml/metadata`.

## Configure a provider

Each provider has a form under Settings → Authentication. Fill it in, save, then sign in with a test account before relying on it.

### LDAP

| Field | Example |
| --- | --- |
| URL | `ldaps://dc01.example.com:636` |
| Bind DN and password | A service account allowed to search the directory |
| Search base | `OU=Users,DC=example,DC=com` |
| Search filter | `(sAMAccountName={{username}})`. `{{username}}` is replaced by the login typed by the user. |

### Azure AD / Microsoft Entra ID

1. In the Azure portal, register an application and add the Azure callback URL above as a web redirect URI.
2. Copy the **tenant ID**, the **client ID** and a **client secret** into Taskmaster.

### Google Workspace

1. In Google Cloud Console, create an OAuth client ID of type *Web application* and add the Google callback URL above.
2. Copy the **client ID** and the **client secret** into Taskmaster.
3. Optionally set the **hosted domain** to accept only accounts of that Google Workspace domain.

### Generic OIDC

1. In your identity provider, create a client with the generic OIDC callback URL above.
2. In Taskmaster, set the **issuer URL**, the **client ID**, the **client secret**, the **scopes** (usually `openid email profile`) and the name shown on the sign-in button.

The issuer must resolve to a public IP. For a provider on the internal network, set `OIDC_ALLOW_PRIVATE_IPS=true`.

### Generic SAML 2.0

1. In your identity provider, create a SAML application with the ACS URL above.
2. In Taskmaster, set the **entity ID**, the identity provider **SSO URL** and its **X.509 signing certificate**.

Assertions must be signed.

## MFA and passkeys

- **MFA**: users enroll an authenticator app (TOTP) from their profile. The recovery codes are shown only once, at enrollment.
- **Passkeys**: enable them under Settings → Authentication. Users then register one from their profile and can sign in without a password.
- **Requirements**: MFA and passkeys can each be required per role (super admin, manager, user). A user who must change their password does it before enrolling a passkey.

### Passkeys need a stable domain

The passkey domain (relying party ID) is the domain of `FRONTEND_URL`, unless `RP_ID` is set. It is never taken from the browser request, so each installation must set its own public URL:

```dotenv
FRONTEND_URL=https://taskmaster.example.com
# Optional, domain only (no https://, port or path):
# RP_ID=taskmaster.example.com
```

- Outside `localhost`, passkeys need HTTPS with a certificate the browser trusts.
- An IP address cannot be a relying party ID.
- Passkeys registered for one domain do not work on another one. Keep the same domain when you move a server.

The error `'rp.id' cannot be used with the current origin` means the browser opened a different address than the configured one. Open the configured public address, or fix `FRONTEND_URL`, and restart.

**Windows service:** edit `C:\ProgramData\Taskmaster\config\.env`, then restart the Taskmaster service. Updates keep this file, so an old `localhost` value must be fixed by hand. For a new installation, the MSI has a **Public URL** field (`TASKMASTER_PUBLIC_URL` in a silent install) that fills `FRONTEND_URL`, `BACKEND_URL` and `CORS_ORIGIN`.

## Sessions

- The access token lasts 15 minutes. The browser renews it on its own through `/api/auth/refresh`.
- Both tokens are `HttpOnly` cookies, never readable by JavaScript.
- **Sign out after inactivity** (Settings → Authentication) is how long a user can stay idle before signing in again: 5 to 1440 minutes, 30 by default. Every use of the application restarts the period. A change applies within a minute, including to open sessions.
- Guest (TV) sessions last a year, whatever this setting says.
- Renewing a session is refused when the request does not come from a trusted origin. The trusted origins are the address used to reach the server, `CORS_ORIGIN`, `FRONTEND_URL` and `BACKEND_URL`. See [Troubleshooting](troubleshooting.md#users-are-signed-out-every-15-minutes).

## Protection against brute force

**Rate limits per IP**, on top of the global limit of 60 requests per minute:

| Endpoint | Limit |
| --- | --- |
| `POST /api/auth/login` | 5 per minute |
| `POST /api/auth/mfa/verify` | 5 per minute |
| `POST /api/auth/refresh` | 30 per minute |
| `POST /api/auth/external/exchange`, `POST /api/auth/guest/exchange` | 10 per minute |

**Progressive lockout.** Failed sign-ins are counted in Redis, per account and per IP:

| Failures within 30 minutes | Lockout |
| --- | --- |
| 5th | 5 minutes |
| 10th and later | 30 minutes |

A successful sign-in resets both counters. IPs listed in `AUTH_LOCKOUT_IP_WHITELIST` skip the per-IP counter (useful behind a shared NAT), but the per-account counter still applies.

**Logs.** Every attempt writes a structured line that a SIEM can alert on. No password is logged:

- `[AUTH_METRIC_SUCCESS]`
- `[AUTH_METRIC_FAIL] motif=…`, where the motif is `USER_NOT_FOUND`, `BAD_PASSWORD`, `INVALID_MFA_CODE`…
- `[AUTH_METRIC_LOCKED_OUT]`

## Check a configuration

- The provider redirects back without a callback error.
- A test account signs in and lands on the task board.
- The backend log shows no `[AUTH_METRIC_FAIL]` for that account.
- A local super admin account still works, in case the provider goes down.
