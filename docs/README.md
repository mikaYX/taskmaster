# Taskmaster documentation

## Use

| Guide | Content |
| --- | --- |
| [User guide](user-guide.md) | Task board, validating and reporting tasks, checklists, corrective actions, delegations, Todo, analytics |
| [Use cases](use-cases.md) | Example task definitions and schedules |

## Install and configure

| Guide | Content |
| --- | --- |
| [Getting started](getting-started.md) | Docker, development from source, first login |
| [Configuration](configuration.md) | Every environment variable |
| [Authentication](authentication.md) | Roles, LDAP, Azure AD, Google, OIDC, SAML, MFA, passkeys, sessions, brute-force protection |
| [API keys](api-keys.md) | Machine-to-machine access and the incoming webhook |
| [Windows Server](windows-server-2019-local.md) | MSI installation without Docker |

## Operate

| Guide | Content |
| --- | --- |
| [Operations](operations.md) | Deployment, backups, restore, monitoring, privacy and retention |
| [Version updates](version-updates.md) | Update checks and how to update each installation type |
| [Troubleshooting](troubleshooting.md) | Common problems and their fixes |
| [Docker build](docker-build.md) | Building, publishing and scanning the image |
| [Windows release checklist](windows-release-checklist.md) | Validating a Windows MSI candidate |

## Screenshots

[`screenshots/`](screenshots/) holds the README images:
- light and dark captures of each page (`board-light.png`, `board-dark.png`…);
- the GIFs `setup-wizard.gif`, `validate-task.gif` and `create-task.gif`.

They are made by [`scripts/docs-screenshots.cjs`](../scripts/docs-screenshots.cjs) (`npm run docs:screenshots`) on fictional demo data. The script completes the setup wizard and seeds data, so run it against a throwaway instance only: its header lists the steps.
