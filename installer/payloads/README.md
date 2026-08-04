# installer/payloads/

Third-party installers that `installer/build.ps1` chains into `Setup.exe`.
This directory holds **binary payloads only** — never commit the actual
installer binaries to git (`.gitignore` excludes `*.exe`/`*.msi` here, keeping
only this README and `checksums.sha256`).

## What's auto-fetched vs. what you must place here manually

| Payload | How it's obtained | Why |
|---|---|---|
| Node.js 24 LTS x64 runtime | Auto-fetched by `build.ps1` from nodejs.org, verified against the published `SHASUMS256.txt` | Official Node.js releases are freely redistributable |
| WinSW (service wrapper) | Auto-fetched by `build.ps1` from the WinSW GitHub Releases, verified against a SHA-256 pinned in `build.ps1` | Apache-2.0, freely redistributable |
| **PostgreSQL 17 x64 installer** | Auto-fetched by `build.ps1` from EnterpriseDB, verified against `checksums.sha256` below | The PostgreSQL License is permissive/redistribution-friendly |
| **Memurai installer (`memurai.msi`)** | **You must download it yourself** from https://www.memurai.com and place it here | Memurai is proprietary — this project cannot legally redistribute it. `build.ps1` will never download it automatically. |

If `memurai.msi` (with a matching entry in `checksums.sha256`) is not present,
`build.ps1` still builds a working `Setup.exe`, but the Burn chain's Memurai
package is skipped (`Vital="no"` in `Bundle.wxs`) — the resulting installer
will only support "use an existing Redis-compatible server" for the cache,
not "install locally". `build.ps1` prints a clear warning in this case; it
never fails silently and never substitutes a different package.

## Adding/updating a payload

1. Download the official installer for the exact version you intend to ship.
2. Compute its hash:
   ```powershell
   Get-FileHash -Algorithm SHA256 .\memurai.msi
   ```
3. Add or update the corresponding line in `checksums.sha256` (format:
   `<sha256>  <filename>`, matching the output of `Get-FileHash`/`sha256sum`).
4. Re-run `installer\build.ps1`. It refuses to proceed with a payload whose
   hash doesn't match — this is the supply-chain integrity check required
   before any third-party binary is chained into Setup.exe.

## Files expected in this directory at build time

```
installer/payloads/
  README.md              (this file — committed)
  checksums.sha256        (committed — hashes only, no binaries)
  postgresql-17-x64.exe   (fetched automatically by build.ps1; gitignored)
  memurai.msi             (you place this manually; gitignored)
```
