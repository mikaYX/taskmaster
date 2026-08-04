# `backend/scripts/admin/`

Outils ponctuels (debug, support, maintenance) **non utilisés par l'application**.
Ils ont été regroupés ici pour :

- éviter qu'un script destructif soit lancé par erreur depuis la racine ;
- clarifier la séparation avec le code applicatif (`src/`) ;
- documenter leur intention.

Aucun de ces scripts n'est référencé par `package.json`, `Dockerfile`,
`docker-entrypoint.sh` ou par un workflow CI.

## Inventaire

| Fichier | Type | Usage |
|---|---|---|
| `check-saml.js` | debug | liste les méthodes de `SAML.prototype` (ponctuel) |
| `check-users.ts` | debug | dump JSON de la table `User` — **ne pas exécuter en prod, contient passwordHash** |
| `clear.ts` | maintenance destructive | supprime les clés `auth.azureAd.*` / `auth.google.*` de `Config` — exige `CONFIRM_CLEAR=yes` |
| `reset_password.js` | maintenance destructive | réinitialise le mot de passe de l'utilisateur `admin` — exige `CONFIRM_RESET=yes` + `ADMIN_NEW_PASSWORD` |
| `parse-audit.js`, `show-jest-audit.js`, `show-jest-core-audit.js`, `show-minimatch.js`, `show-vuln-sources.js` | debug | parsing de l'ancien `audit.json` (qui n'est plus tracké) |
| `test.js` | debug | scratchpad |
| `walkthrough_fix.sh` | obsolète | `sed` sur un chemin Windows absolu (résidu personnel) |

## Exécution

```bash
# Depuis la racine du repo :
node backend/scripts/admin/reset_password.js   # exige CONFIRM_RESET=yes
npx tsx backend/scripts/admin/clear.ts         # exige CONFIRM_CLEAR=yes
```

Privilégier `prisma studio` ou l'interface admin pour la plupart des opérations.
