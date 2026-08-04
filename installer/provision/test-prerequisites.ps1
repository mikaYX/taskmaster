#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Pre-flight prerequisite checks, run before ANY provisioning/migration work in
  orchestrate-install.ps1. Fails fast with a clear French diagnostic when a
  prerequisite is missing or unreachable, instead of letting the install run
  to completion (Prisma migration, service registration...) against a broken
  target - which is what previously produced a Taskmaster service that
  installs successfully but crashes immediately on start.

  In particular this closes a real gap: -PostgresMode/-RedisMode 'Existing'
  previously trusted the operator-supplied connection strings without ever
  checking they were reachable before proceeding.

.NOTES
  Requires a real Windows x64 host (Assert-WindowsX64) and an administrator
  shell (Get-NetTCPConnection / port ownership lookup). Verified interactively
  against a real Postgres instance and both reachable/unreachable Redis
  targets. See docs/windows-server-2019-local.md.
#>
param(
    [int] $Port = 3000,
    # Needed to locate the bundled Node runtime + the app's own `pg` package
    # for the PostgreSQL version check below - both are already staged by
    # this point (this script runs after ExtractAppArchive/InstallService).
    [string] $InstallDir = 'C:\Program Files\Taskmaster\app',

    [ValidateSet('Local', 'Existing')] [string] $PostgresMode = 'Local',
    [string] $PostgresInstallerPath,
    [string] $ExistingDatabaseUrl,
    [string] $ExistingPgBinPath,

    [ValidateSet('Local', 'Existing')] [string] $RedisMode = 'Local',
    [string] $MemuraiInstallerPath,
    [string] $ExistingRedisUrl
)

. (Join-Path $PSScriptRoot '..\common\Taskmaster.Common.ps1')
Assert-WindowsX64

Write-Stage 'Verification des prerequis...'
$problems = @()

# Oldest/newest PostgreSQL major version this project has actually been run
# against (17 = bundled by provision-postgres.ps1's Local mode; 18 = an
# operator-supplied Existing server, confirmed working). Below the floor is
# a hard failure (real incompatibility risk); above the ceiling is a
# warning only, since a newer major isn't necessarily broken - just
# unverified - and blind-blocking it outright would be worse than useless
# once a genuinely-fine PostgreSQL 19/20/... server shows up.
$PgMinSupportedMajor = 13
$PgMaxVerifiedMajor = 18

function Test-PostgresVersion {
    param([string] $DatabaseUrl)
    $nodeExe = Join-Path $InstallDir '..\runtime\node\node.exe'
    $checkScript = Join-Path $PSScriptRoot 'check-postgres-version.js'
    if (-not (Test-Path $nodeExe) -or -not (Test-Path $checkScript)) {
        # Should never happen at this point in the install sequence, but
        # degrade to "unknown version" rather than crash the whole check.
        return $null
    }
    $env:TASKMASTER_CHECK_DATABASE_URL = $DatabaseUrl
    # check-postgres-version.js lives under PROVISIONFOLDER, a SIBLING of
    # APPFOLDER (where node_modules\pg actually is) - Node's module
    # resolution only walks up through ANCESTOR directories, never siblings,
    # so a bare `require('pg')` fails with "Cannot find module 'pg'" without
    # this. Confirmed on a real install.
    $env:NODE_PATH = Join-Path $InstallDir 'node_modules'
    try {
        $output = & $nodeExe $checkScript 2>$null
        if ($LASTEXITCODE -ne 0) { return $null }
        return [int] $output
    } catch {
        return $null
    } finally {
        Remove-Item Env:\TASKMASTER_CHECK_DATABASE_URL -ErrorAction SilentlyContinue
        Remove-Item Env:\NODE_PATH -ErrorAction SilentlyContinue
    }
}

function Get-UriOrNull {
    param([string] $Value)
    try { return [Uri] $Value } catch { return $null }
}

# ---- Application port must be free ----------------------------------------
$portInUse = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($portInUse) {
    $procName = (Get-Process -Id $portInUse.OwningProcess -ErrorAction SilentlyContinue).ProcessName
    $problems += "Le port $Port est deja utilise par un autre processus (PID $($portInUse.OwningProcess)$(if ($procName) { " - $procName" })). Choisissez un autre port ou liberez celui-ci avant de continuer."
}

# ---- PostgreSQL --------------------------------------------------------------
if ($PostgresMode -eq 'Existing') {
    if (-not $ExistingDatabaseUrl) {
        $problems += "PostgresMode=Existing mais aucune chaine de connexion (ExistingDatabaseUrl) n'a ete fournie."
    } else {
        $uri = Get-UriOrNull $ExistingDatabaseUrl
        if (-not $uri -or -not $uri.Host) {
            $problems += "ExistingDatabaseUrl n'est pas une URL PostgreSQL valide."
        } else {
            $pgPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
            try {
                Wait-ForTcpPort -ComputerName $uri.Host -Port $pgPort -TimeoutSeconds 10 -Label "PostgreSQL existant ($($uri.Host):$pgPort)"

                # A reachable TCP port doesn't prove it's actually PostgreSQL,
                # nor that the credentials/version are usable - do a real
                # protocol-level connection + version check now, before
                # Prisma migration or service install ever run against it.
                $pgMajor = Test-PostgresVersion -DatabaseUrl $ExistingDatabaseUrl
                if ($null -eq $pgMajor) {
                    $problems += "Impossible de se connecter a PostgreSQL existant ($($uri.Host):$pgPort) avec les identifiants fournis. Verifiez l'utilisateur/mot de passe/nom de base, et que le serveur accepte bien les connexions PostgreSQL (le port est ouvert mais la connexion echoue)."
                } elseif ($pgMajor -lt $PgMinSupportedMajor) {
                    $problems += "PostgreSQL existant ($($uri.Host):$pgPort) est en version $pgMajor, non supportee (minimum PostgreSQL $PgMinSupportedMajor requis)."
                } elseif ($pgMajor -gt $PgMaxVerifiedMajor) {
                    Write-Host "AVERTISSEMENT : PostgreSQL existant ($($uri.Host):$pgPort) est en version $pgMajor, plus recente que la derniere version verifiee avec Taskmaster (PostgreSQL $PgMaxVerifiedMajor). L'installation continue, mais testez cette configuration avant une mise en production." -ForegroundColor Yellow
                } else {
                    Write-Stage "PostgreSQL existant : version $pgMajor detectee, compatible."
                }
            } catch {
                $problems += "PostgreSQL existant injoignable sur $($uri.Host):$pgPort. Verifiez que le serveur est demarre et accessible depuis cette machine, et que ExistingDatabaseUrl est correct."
            }
        }
    }
    if ($ExistingPgBinPath) {
        foreach ($tool in @('pg_dump.exe', 'pg_restore.exe')) {
            if (-not (Test-Path (Join-Path $ExistingPgBinPath $tool))) {
                $problems += "ExistingPgBinPath ($ExistingPgBinPath) ne contient pas $tool, requis pour les sauvegardes/restaurations."
            }
        }
    }
} else {
    # Local mode via Setup.exe: Burn's own chain already installs PostgreSQL
    # (ExePackage) before orchestrate-install.ps1 ever runs, so no installer
    # path is passed down in that flow - only require one here when the
    # service isn't already present (mirrors provision-postgres.ps1's own
    # idempotency check, which is the only place that would actually use it).
    $pgServiceExists = Get-Service -Name 'postgresql-x64-17' -ErrorAction SilentlyContinue
    if (-not $pgServiceExists -and (-not $PostgresInstallerPath -or -not (Test-Path $PostgresInstallerPath))) {
        $problems += "PostgresMode=Local, le service postgresql-x64-17 n'existe pas encore, et l'installeur PostgreSQL est introuvable : '$PostgresInstallerPath'. Voir installer/payloads/README.md."
    }
}

# ---- Redis / Memurai ---------------------------------------------------------
if ($RedisMode -eq 'Existing') {
    if (-not $ExistingRedisUrl) {
        $problems += "RedisMode=Existing mais aucune URL (ExistingRedisUrl) n'a ete fournie."
    } else {
        $uri = Get-UriOrNull $ExistingRedisUrl
        if (-not $uri -or -not $uri.Host) {
            $problems += "ExistingRedisUrl n'est pas une URL valide."
        } else {
            $redisPort = if ($uri.Port -gt 0) { $uri.Port } else { 6379 }
            try {
                Wait-ForTcpPort -ComputerName $uri.Host -Port $redisPort -TimeoutSeconds 10 -Label "Redis/Memurai existant ($($uri.Host):$redisPort)"
                if (-not (Test-RedisPingable -ComputerName $uri.Host -Port $redisPort)) {
                    $problems += "Redis/Memurai existant ($($uri.Host):$redisPort) ne repond pas au PING. Verifiez qu'il s'agit bien d'un serveur Redis-compatible et qu'aucun mot de passe (requirepass) n'est requis."
                }
            } catch {
                $problems += "Redis/Memurai existant injoignable sur $($uri.Host):$redisPort. Verifiez que le serveur est demarre et accessible depuis cette machine, et que ExistingRedisUrl est correct."
            }
        }
    }
} else {
    # Same reasoning as PostgreSQL above: Memurai's MsiPackage in Burn's chain
    # (when present) installs it before orchestrate-install.ps1 runs.
    $memuraiServiceExists = Get-Service -Name 'Memurai' -ErrorAction SilentlyContinue
    if (-not $memuraiServiceExists -and (-not $MemuraiInstallerPath -or -not (Test-Path $MemuraiInstallerPath))) {
        $problems += "RedisMode=Local, le service Memurai n'existe pas encore, et l'installeur Memurai est introuvable : '$MemuraiInstallerPath'. Voir installer/payloads/README.md."
    }
}

# ---- Result -------------------------------------------------------------------
if ($problems.Count -gt 0) {
    Write-Host ''
    Write-Host 'ECHEC DES PREREQUIS - installation interrompue avant toute modification du systeme :' -ForegroundColor Red
    $problems | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    throw "$($problems.Count) prerequis non satisfait(s). Voir le detail ci-dessus."
}

Write-Stage 'Prerequis OK.'
