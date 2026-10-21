# `backend/scripts/admin/`

One-off tools for debugging, support and maintenance. **The application does not use them**: no `package.json` script, Dockerfile, entrypoint or CI workflow refers to them. They live here so that a destructive script is not run by mistake from the root, and so their purpose is written down.

| File | Type | Purpose |
| --- | --- | --- |
| `check-saml.js` | Debug | Lists the methods of `SAML.prototype` |
| `check-users.ts` | Debug | Dumps the `User` table as JSON. **Never run it in production: it prints password hashes.** |
| `clear.ts` | Destructive | Deletes the `auth.azureAd.*` and `auth.google.*` settings. Requires `CONFIRM_CLEAR=yes`. |
| `reset_password.js` | Destructive | Resets the password of the `admin` user. Requires `CONFIRM_RESET=yes` and `ADMIN_NEW_PASSWORD`. |
| `parse-audit.js`, `show-jest-audit.js`, `show-jest-core-audit.js`, `show-minimatch.js`, `show-vuln-sources.js` | Debug | Parse an old `audit.json`, no longer tracked |
| `test.js` | Debug | Scratchpad |
| `walkthrough_fix.sh` | Obsolete | `sed` on an absolute Windows path |

From the repository root:

```bash
CONFIRM_RESET=yes ADMIN_NEW_PASSWORD='…' node backend/scripts/admin/reset_password.js
CONFIRM_CLEAR=yes npx tsx backend/scripts/admin/clear.ts
```

For most operations, prefer the administration screens or `npx prisma studio`.
