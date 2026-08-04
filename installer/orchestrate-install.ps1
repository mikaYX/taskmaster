#Requires -RunAsAdministrator
<#
.SYNOPSIS
  End-to-end orchestration invoked by the Setup.exe (WiX Burn) bootstrapper
  after the PostgreSQL/Memurai/Taskmaster-MSI chain has run: generates
  secrets, provisions PostgreSQL and the cache (or wires up existing external
  servers), writes C:\ProgramData\Taskmaster\config\.env, runs Prisma
  migrations, installs the Windows Service, and verifies the installation.
  Prints only French-language progress lines and a final result - no secret
  ever appears in output or logs.

.NOTES
  Cannot be executed/verified in this environment - requires a real Windows
  Server 2019 x64 host. See docs/windows-server-2019-local.md.
#>
param(
    [int] $Port = 3000,
    [ValidateSet('Local', 'Lan')] [string] $AccessMode = 'Local',
    [string] $HostName = 'localhost',
    [string] $DataDir = 'C:\ProgramData\Taskmaster',
    [string] $InstallDir = 'C:\Program Files\Taskmaster\app',

    [ValidateSet('Local', 'Existing')] [string] $PostgresMode = 'Local',
    [string] $PostgresInstallerPath,
    [string] $ExistingDatabaseUrl,
    [string] $ExistingPgBinPath, # required when -PostgresMode Existing, for backup/restore (pg_dump.exe/pg_restore.exe)
    # Discrete alternative to -ExistingDatabaseUrl, used by Taskmaster.msi's
    # own native UI dialogs (which collect host/port/db/user/password as
    # separate fields, not one DSN string). When -PostgresPassword is
    # supplied, it takes precedence and -ExistingDatabaseUrl is built from
    # these below, DSN-encoding the user/password properly - raw string
    # concatenation into a URL breaks if either contains '@', ':', '/', '%'.
    [string] $PostgresDbHost = 'localhost',
    [int] $PostgresDbPort = 5432,
    [string] $PostgresDb = 'taskmaster',
    [string] $PostgresUser = 'taskmaster',
    [string] $PostgresPassword,
    # Optional superuser credentials (e.g. the "postgres" role), used ONLY to
    # idempotently create/update the app's own role+database below - never
    # stored, never used again afterwards. Left blank means "the DBA already
    # created the taskmaster role/database themselves" (previous behaviour,
    # unchanged). Without this, "Existing" mode had no way to provision
    # anything - it just tried to log in AS the app role directly, which
    # fails with Prisma P1000 the first time that role doesn't exist yet.
    [string] $PostgresAdminUser = 'postgres',
    [string] $PostgresAdminPassword,

    [ValidateSet('Local', 'Existing')] [string] $RedisMode = 'Local',
    [string] $MemuraiInstallerPath,
    [string] $ExistingRedisUrl,
    [string] $RedisDbHost = 'localhost',
    [int] $RedisDbPort = 6379
)

$ErrorActionPreference = 'Stop'

# Logging starts BEFORE anything else (including the common module import)
# can throw. Previously Start-Transcript ran only after Import-Module +
# Assert-WindowsX64 succeeded, so a failure in either of those was completely
# silent - no log line, no transcript, nothing - which is exactly what made a
# real install failure (Burn's elevated child process hitting an error here)
# next to impossible to diagnose from the install.log alone.
$envFilePath = Join-Path $DataDir 'config\.env'
$logPath = Join-Path $DataDir 'logs\install.log'
New-Item -ItemType Directory -Path (Split-Path $logPath) -Force | Out-Null
Start-Transcript -Path $logPath -Append | Out-Null

# Referenced by the catch block's cleanup below - must exist even if the
# script fails before the line that normally sets it, otherwise Set-
# StrictMode (in effect via the dot-sourced common script) throws
# "Impossible d'extraire la variable" INSIDE the cleanup itself, hiding the
# real failure. Confirmed on a real install that failed before reaching
# New-EnvFileIfMissing.
$wasCreated = $false

try {
    # Dot-sourced, not Import-Module'd: see Taskmaster.Common.ps1's own header
    # comment for why - Import-Module-ing that file was the trigger for
    # PowerShell 5.1's "TypeData member already present" duplicate-
    # registration errors under Burn's elevated ExePackage process, and (once
    # those were worked around) Export-ModuleMember silently prevented every
    # function in it from ever reaching this scope in the first place, since
    # dot-sourcing a .psm1 (as opposed to a .ps1) still carries an implicit
    # module boundary. Confirmed across several real install attempts.
    . (Join-Path $PSScriptRoot 'common\Taskmaster.Common.ps1')
    Assert-WindowsX64

    if ($PostgresMode -eq 'Existing' -and $PostgresPassword) {
        $encodedUser = ConvertTo-DsnEncoded $PostgresUser
        $encodedPassword = ConvertTo-DsnEncoded $PostgresPassword
        $ExistingDatabaseUrl = "postgresql://$encodedUser`:$encodedPassword@${PostgresDbHost}:$PostgresDbPort/$PostgresDb"
    }
    if ($RedisMode -eq 'Existing' -and -not $ExistingRedisUrl) {
        $ExistingRedisUrl = "redis://${RedisDbHost}:$RedisDbPort"
    }

    # ---- Existing PostgreSQL: create/update the app's own role+database --
    # Runs BEFORE the prerequisite auth check below, which logs in AS the
    # app role - that would always fail on a brand-new role otherwise.
    # Skipped entirely (previous behaviour) when no admin password was
    # supplied - the DBA is assumed to have already created everything.
    if ($PostgresMode -eq 'Existing' -and $PostgresAdminPassword) {
        Write-Stage 'Creation/mise a jour du role et de la base PostgreSQL (acces admin)...'
        $encodedAdminUser = ConvertTo-DsnEncoded $PostgresAdminUser
        $encodedAdminPassword = ConvertTo-DsnEncoded $PostgresAdminPassword
        # Connects to the "postgres" maintenance database, never to
        # $PostgresDb directly - the whole point is that $PostgresDb might
        # not exist yet.
        $adminDatabaseUrl = "postgresql://$encodedAdminUser`:$encodedAdminPassword@${PostgresDbHost}:$PostgresDbPort/postgres"

        $nodeExeForProvision = Join-Path $InstallDir '..\runtime\node\node.exe'
        $provisionScript = Join-Path $PSScriptRoot 'provision\provision-existing-postgres.js'
        $env:TASKMASTER_ADMIN_DATABASE_URL = $adminDatabaseUrl
        $env:TASKMASTER_APP_DB_USER = $PostgresUser
        $env:TASKMASTER_APP_DB_NAME = $PostgresDb
        $env:TASKMASTER_APP_DB_PASSWORD = $PostgresPassword
        # provision-existing-postgres.js lives under PROVISIONFOLDER, a
        # SIBLING of APPFOLDER (where node_modules\pg actually is) - Node's
        # module resolution only walks up through ANCESTOR directories, never
        # siblings, so a bare `require('pg')` fails with "Cannot find module
        # 'pg'" without this. Confirmed on a real install.
        $env:NODE_PATH = Join-Path $InstallDir 'node_modules'
        try {
            & $nodeExeForProvision $provisionScript
            if ($LASTEXITCODE -ne 0) { throw "Echec de la creation du role/de la base PostgreSQL via l'acces admin ($PostgresAdminUser). Verifiez le mot de passe admin." }
        } finally {
            Remove-Item Env:\TASKMASTER_ADMIN_DATABASE_URL -ErrorAction SilentlyContinue
            Remove-Item Env:\TASKMASTER_APP_DB_USER -ErrorAction SilentlyContinue
            Remove-Item Env:\TASKMASTER_APP_DB_NAME -ErrorAction SilentlyContinue
            Remove-Item Env:\TASKMASTER_APP_DB_PASSWORD -ErrorAction SilentlyContinue
            Remove-Item Env:\NODE_PATH -ErrorAction SilentlyContinue
        }
        Write-Stage 'Role et base PostgreSQL prets.'
    }

    # ---- Prerequisites (fail fast, before any provisioning/migration) -----
    & (Join-Path $PSScriptRoot 'provision\test-prerequisites.ps1') `
        -Port $Port -InstallDir $InstallDir `
        -PostgresMode $PostgresMode -PostgresInstallerPath $PostgresInstallerPath `
        -ExistingDatabaseUrl $ExistingDatabaseUrl -ExistingPgBinPath $ExistingPgBinPath `
        -RedisMode $RedisMode -MemuraiInstallerPath $MemuraiInstallerPath `
        -ExistingRedisUrl $ExistingRedisUrl

    # ---- PostgreSQL -------------------------------------------------------
    if ($PostgresMode -eq 'Local') {
        $pg = & (Join-Path $PSScriptRoot 'provision\provision-postgres.ps1') -InstallerExePath $PostgresInstallerPath
        $databaseUrl = $pg.DatabaseUrl
        $pgBinPath = $pg.PgBinPath
    } else {
        Write-Stage 'Utilisation du serveur PostgreSQL existant.'
        $databaseUrl = $ExistingDatabaseUrl
        $pgBinPath = $ExistingPgBinPath
    }

    # ---- Cache (Redis/Memurai) ---------------------------------------------
    if ($RedisMode -eq 'Local') {
        $cache = & (Join-Path $PSScriptRoot 'provision\provision-cache.ps1') -UseLocal -InstallerMsiPath $MemuraiInstallerPath
    } else {
        $cache = & (Join-Path $PSScriptRoot 'provision\provision-cache.ps1') -ExistingRedisUrl $ExistingRedisUrl
    }
    $redisUrl = $cache.RedisUrl

    # ---- Firewall (LAN access only) ---------------------------------------
    if ($AccessMode -eq 'Lan') {
        & (Join-Path $PSScriptRoot 'provision\configure-firewall.ps1') -Port $Port
    }

    # ---- Secrets + .env (only written if it doesn't already exist) --------
    $backendUrl = "http://$($HostName):$Port"
    $envValues = [ordered]@{
        NODE_ENV                 = 'production'
        PORT                     = $Port
        BACKEND_URL              = $backendUrl
        FRONTEND_URL             = $backendUrl
        CORS_ORIGIN              = $backendUrl
        TRUST_PROXY              = 'loopback'
        DATABASE_URL             = $databaseUrl
        REDIS_URL                = $redisUrl
        AUTH_SECRET              = (New-RandomSecret -Bytes 48)
        BOOTSTRAP_SECRET         = (New-RandomSecret -Bytes 24)
        BACKUP_ENCRYPTION_KEY    = (New-RandomSecret -Bytes 48)
        BACKUP_STORAGE_PATH      = (Join-Path $DataDir 'backups')
        PG_BIN_PATH              = $pgBinPath
        TASKMASTER_INSTALL_DIR   = $InstallDir
        TASKMASTER_DATA_DIR      = $DataDir
        TASKMASTER_ENV_FILE      = $envFilePath
        OFFLINE_MODE             = 'true'
    }

    $wasCreated = New-EnvFileIfMissing -Path $envFilePath -Values $envValues
    if ($wasCreated) {
        Protect-TaskmasterConfigAcl -Path (Split-Path $envFilePath)
    }

    # ---- Prisma migrations --------------------------------------------------
    Write-Stage 'Migration Prisma...'
    $nodeExe = Join-Path $InstallDir '..\runtime\node\node.exe'
    # NOT node_modules\.bin\prisma.cmd: that's a cmd.exe batch wrapper (starts
    # with `@ECHO off`) meant to be run BY THE SHELL, which itself re-invokes
    # node with the real entry point below - passing it directly to node.exe
    # makes node try to parse batch syntax as JavaScript and fail immediately
    # with a SyntaxError. Confirmed on a real install. Calling the actual JS
    # entry point (which prisma.cmd itself calls via `%dp0%\..\prisma\build\
    # index.js`) directly avoids the wrapper - and keeps control over exactly
    # which node.exe runs it (the bundled portable runtime), which relying on
    # the wrapper's own PATH-based node resolution would not guarantee.
    $prismaCli = Join-Path $InstallDir 'node_modules\prisma\build\index.js'
    Push-Location $InstallDir
    try {
        $env:TASKMASTER_ENV_FILE = $envFilePath
        # prisma.config.cjs (shipped alongside app/, see build.ps1) reads
        # DATABASE_URL straight from process.env - it doesn't dotenv-load any
        # file itself. Without this, `migrate deploy` fails with "the
        # datasource.url property is required in your Prisma config file",
        # confirmed on a real install.
        $env:DATABASE_URL = $databaseUrl
        # Target servers are frequently offline (no internet egress) - stop
        # Prisma's CLI from ever trying to phone home for its telemetry/
        # update-check ping during install.
        $env:CHECKPOINT_DISABLE = '1'
        & $nodeExe $prismaCli migrate deploy --schema=./prisma/schema.prisma
        if ($LASTEXITCODE -ne 0) { throw 'prisma migrate deploy a echoue.' }
    } finally {
        Pop-Location
        Remove-Item Env:\TASKMASTER_ENV_FILE -ErrorAction SilentlyContinue
        Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
        Remove-Item Env:\CHECKPOINT_DISABLE -ErrorAction SilentlyContinue
    }

    # ---- Windows Service ------------------------------------------------------
    # -ServiceDir is required here too (see the identical fix on the MSI's own
    # InstallServiceCmd in Product.wxs): install-service.ps1's default
    # ('C:\Program Files\Taskmaster\service') is only correct for the default
    # install location. This is a SEPARATE call from the MSI's own
    # InstallService action (which runs earlier, before .env/Prisma are
    # ready) - re-installs/restarts the service now that everything is
    # actually configured. Missing this argument here specifically was
    # confirmed on a real custom-install-directory (C:\TaskmasterCustom) run:
    # every earlier stage (role/database creation, prerequisites, Prisma
    # migration) succeeded, only this un-parameterized call failed with
    # "WinSW service files not found in C:\Program Files\Taskmaster\service".
    $serviceDir = Join-Path (Split-Path $InstallDir -Parent) 'service'
    $serviceDependencies = @()
    if ($PostgresMode -eq 'Local') { $serviceDependencies += 'postgresql-x64-17' }
    if ($RedisMode -eq 'Local') { $serviceDependencies += 'Memurai' }
    & (Join-Path $PSScriptRoot 'service\install-service.ps1') -ServiceDir $serviceDir -Dependencies $serviceDependencies

    # ---- Health check ----------------------------------------------------
    Write-Stage 'Controle de sante...'
    Start-Sleep -Seconds 3

    # Get-Service returns $null (not a terminating error) when the service
    # doesn't exist - genuinely expected here for postgresql-x64-17/Memurai
    # in "Existing" mode, since that server may not even be a local Windows
    # service. Under Set-StrictMode -Version Latest (in effect via the
    # dot-sourced common script), `$null.Status` is a terminating error
    # ("the property 'Status' cannot be found"), not simply $null - confirmed
    # on a real install where this crashed the health check outright instead
    # of reporting a clean pass/fail. Capture the service object first so the
    # null case short-circuits before `.Status` is ever touched.
    function Test-ServiceRunning {
        param([string] $Name)
        $svc = Get-Service -Name $Name -ErrorAction SilentlyContinue
        return ($null -ne $svc) -and ($svc.Status -eq 'Running')
    }

    $checks = @()
    $checks += @{ Name = 'Service PostgreSQL'; Ok = (Test-ServiceRunning 'postgresql-x64-17') -or ($PostgresMode -eq 'Existing') }
    $checks += @{ Name = 'Service Memurai'; Ok = (Test-ServiceRunning 'Memurai') -or ($RedisMode -eq 'Existing') }
    $checks += @{ Name = 'Service Taskmaster'; Ok = (Test-ServiceRunning 'Taskmaster') }

    # 40 retries * ~3s = up to ~120s: generous on purpose. Confirmed on a real
    # install that the freshly-extracted node.exe/cmd.exe (written to disk by
    # ExtractAppArchive/ExtractNodeRuntimeArchive moments earlier) can take
    # 40-50+ seconds to actually start responding the FIRST time they're
    # executed, even though the identical binaries start in under 25s once
    # antivirus real-time protection has already scanned/cached them from an
    # earlier run - the original 15*2s (~30s) budget was tuned against
    # already-cached binaries and undercounted this one-time cold-scan cost
    # on a fresh install.
    $healthOk = $false
    $rootOk = $false
    for ($i = 0; $i -lt 40 -and (-not $healthOk); $i++) {
        try {
            $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 5
            $healthOk = $resp.StatusCode -eq 200
        } catch { Start-Sleep -Seconds 3 }
    }
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 5
        $rootOk = $resp.StatusCode -eq 200
    } catch { $rootOk = $false }

    $checks += @{ Name = 'GET /api/health'; Ok = $healthOk }
    $checks += @{ Name = 'GET /'; Ok = $rootOk }
    $checks += @{ Name = 'Frontend present (client/index.html)'; Ok = (Test-Path (Join-Path $InstallDir 'client\index.html')) }

    $failed = $checks | Where-Object { -not $_.Ok }
    if ($failed) {
        $names = ($failed | ForEach-Object { $_.Name }) -join ', '
        throw "L'installation a echoue aux controles suivants : $names. Consultez le journal : $logPath"
    }

    Write-Host ''
    Write-Host "Taskmaster est installe et accessible sur $backendUrl" -ForegroundColor Green
    Write-Host "Journal d'installation : $logPath"
} catch {
    Write-Host ''
    Write-Host "ECHEC DE L'INSTALLATION : $($_.Exception.Message)" -ForegroundColor Red

    # Best-effort cleanup so a retry starts from a clean slate instead of
    # tripping over half-finished state from this failed attempt. Deliberately
    # narrow in scope - never touches PostgreSQL/Memurai (pre-existing
    # "Existing" servers, or a separate system component in "Local" mode) or
    # ProgramData\Taskmaster's data/backups/logs, only what THIS run itself
    # just created: a brand-new .env (never one that already existed - see
    # $wasCreated from New-EnvFileIfMissing) and the Taskmaster service (if
    # InstallService above ran before the later failure).
    try {
        if ($wasCreated -and (Test-Path $envFilePath)) {
            Remove-Item $envFilePath -Force -ErrorAction SilentlyContinue
        }
        $serviceDir = Join-Path (Split-Path $InstallDir -Parent) 'service'
        & (Join-Path $PSScriptRoot 'service\uninstall-service.ps1') -ServiceDir $serviceDir
    } catch {
        Write-Host "Nettoyage partiel echoue : $($_.Exception.Message)" -ForegroundColor Yellow
    }

    Write-Host "Journal d'installation (aucun secret n'y est ecrit) : $logPath"
    Stop-Transcript | Out-Null
    # PowerShell runs hidden during install (no console to read this from) -
    # open the transcript directly so the failure is visible without the
    # admin having to go hunt for the file themselves.
    Start-Process notepad.exe -ArgumentList $logPath -ErrorAction SilentlyContinue
    exit 1
}

Stop-Transcript | Out-Null
