# Windows release checklist

How to validate a Windows MSI candidate (`Taskmaster-<version>-x64.msi`) before shipping it. The MSI expects PostgreSQL and Redis (or Memurai) to be installed already.

Target systems are Windows 11 x64 or later and Windows Server 2019 x64 or later. Run acceptance checks on the Windows version you intend to deploy; a passing build alone does not validate installation on every supported system.

## Build the candidate

On a Windows build machine, run `installer/build.ps1`, or start the **Build Windows installer candidate** workflow manually on the revision to test. The workflow:
- builds an unsigned MSI;
- uploads it as a test artifact, with the verification scripts and their `common` folder;
- creates no public release and installs nothing.

The candidate number is the one in `package.json`, and its changes are in the matching section of the [changelog](../CHANGELOG.md). Never ship a published version again with different content.

Sign the delivered MSI with the organization's certificate, and compute `SHA256SUMS` again after signing (`build.ps1 -Sign`).

## Install and update on a VM

1. Use a throwaway Windows Server VM, with a test database and a test Redis. Take a snapshot. Check the SHA-256 of the downloaded MSI.
2. Install the **previous** version. Create a few tasks, statuses, an avatar and a procedure. Note the expected values, without copying secrets into the report.
3. In an administrator PowerShell, record the fingerprint of `.env`:

   ```powershell
   $configHash = (Get-FileHash 'C:\ProgramData\Taskmaster\config\.env' -Algorithm SHA256).Hash
   ```

4. Create a **FULL backup from the Taskmaster interface**, wait until it is finished, and download a copy.
   - This step exercises the service account: running `pg_dump` in an administrator console does not prove the service has the rights.
   - If the previous version fails here, note it, and keep the VM snapshot plus an independent copy of the database and files before testing the update.
5. Install the candidate MSI over it, then run:

   ```powershell
   .\installer\verify-installation.ps1 `
     -ExpectedVersion '<candidate-version>' `
     -ExpectedEnvHash $configHash `
     -PublicUrl 'https://taskmaster.example.com' `
     -ReportPath '.\installation-report.json'
   ```

   The script checks the service, the HTTP health, the PostgreSQL tools, the version, the kept configuration and the passkey options. It changes neither the services nor the database. Its report holds check results and the service account name, never `.env` values.
6. Check the old tasks and their history:
   - a task without a checklist must still validate in one click;
   - create a checklist, photo evidence and a corrective action, then check who can see them with each role.

## Backup and restore

1. On the candidate test instance, add recognizable data and a photo, then create a new FULL backup.
2. Validate the archive from the interface. Keep the encryption key separately: it is never in the archive.
3. Restore it on **another isolated throwaway instance**, with the same version and the matching key. A restore replaces the target's data: never use production as the target.
4. Compare tasks, statuses, checklists, photos, procedures, corrective actions and accounts. Create new records after the restore, to check the PostgreSQL sequences too.
5. Check that an altered, unsigned or dump-less archive is refused. Do not force a cross-version restore to get around a failed test.

## Passkeys and final validation

From a browser that trusts the HTTPS certificate, use the installation's own public domain:
- create a passkey, sign out and sign in with it. The automatic check of the options does not replace this test;
- also check a standard user, a manager and guest mode.

Keep the JSON report, the SHA-256 of the candidate, the restore results and the browser observations. Until these Windows checks are done, the candidate is not validated for production.
