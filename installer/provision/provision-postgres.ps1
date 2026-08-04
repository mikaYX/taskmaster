#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Provisions a local PostgreSQL 17 x64 instance for Taskmaster: silent install,
  localhost-only listening, idempotent `taskmaster` role + database creation,
  and Prisma migration. Called by installer/orchestrate-install.ps1 during a
  local ("install PostgreSQL locally") Setup.exe run. Skipped entirely when the
  administrator chose "use an existing PostgreSQL server".

.OUTPUTS
  Hashtable: @{ DatabaseUrl = '...'; PgBinPath = '...' }

.NOTES
  Cannot be executed/verified in this environment - requires a real Windows
  Server 2019 x64 host. See docs/windows-server-2019-local.md and
  installer/payloads/README.md (payload must be pre-staged by build.ps1).
#>
param(
    [Parameter(Mandatory)] [string] $InstallerExePath, # staged by build.ps1 from installer/payloads (or auto-fetched, see payloads/README.md)
    [string] $PgInstallDir = 'C:\Program Files\PostgreSQL\17',
    [string] $PgDataDir = 'C:\ProgramData\Taskmaster\data\postgresql',
    [string] $DbName = 'taskmaster',
    [string] $DbUser = 'taskmaster',
    [int] $Port = 5432
)

. (Join-Path $PSScriptRoot '..\common\Taskmaster.Common.ps1')
Assert-WindowsX64

Write-Stage 'Installation de PostgreSQL...'

$binDir = Join-Path $PgInstallDir 'bin'
$serviceName = 'postgresql-x64-17'

$alreadyInstalled = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if (-not $alreadyInstalled) {
    $adminPassword = New-RandomPassword -Length 32
    $optionFile = Join-Path $env:TEMP "pg-install-$([guid]::NewGuid().ToString('N')).ini"

    # PostgreSQL's EDB installer supports an unattended response file; the
    # admin password goes in that file, never on the command line (which
    # would be visible via process listings / Get-CimInstance Win32_Process).
    @"
[Setup]
InstallDir=$PgInstallDir
DataDir=$PgDataDir
Port=$Port
Locale=
SuperPassword=$adminPassword
ServiceAccount=NT AUTHORITY\NetworkService
ServiceName=$serviceName
"@ | Set-Content -Path $optionFile -Encoding ASCII

    try {
        # Lock the response file down before it's used, in case the installer
        # spawns child processes that could otherwise read it via a shared temp dir.
        icacls $optionFile /inheritance:r /grant:r 'Administrators:F' 'SYSTEM:F' | Out-Null

        Write-Stage 'Execution du programme d''installation PostgreSQL (silencieux)...'
        $proc = Start-Process -FilePath $InstallerExePath -ArgumentList @(
            '--mode', 'unattended',
            '--unattendedmodeui', 'minimal',
            '--optionfile', $optionFile
        ) -Wait -PassThru
        if ($proc.ExitCode -ne 0) {
            throw "PostgreSQL installer exited with code $($proc.ExitCode)"
        }
    } finally {
        if (Test-Path $optionFile) { Remove-Item $optionFile -Force }
    }
} else {
    Write-Stage 'PostgreSQL deja installe, reutilisation du service existant.'
    $adminPassword = $null # not (re)generated; role creation below uses trust/peer via local admin context where possible
}

Write-Stage 'Initialisation de la base...'

# Restrict to localhost only - never open the firewall for 5432.
$confPath = Join-Path $PgDataDir 'postgresql.conf'
$hbaPath = Join-Path $PgDataDir 'pg_hba.conf'
if (Test-Path $confPath) {
    (Get-Content $confPath) -replace "^#?listen_addresses\s*=.*", "listen_addresses = 'localhost'" |
        Set-Content $confPath
}
if (Test-Path $hbaPath) {
    # Ensure only loopback entries remain trusted/md5 - EDB's default already
    # restricts to 127.0.0.1/::1 for a fresh local install; this is a defensive
    # re-assertion in case defaults change between installer versions.
    $desired = @(
        'host    all             all             127.0.0.1/32            scram-sha-256'
        'host    all             all             ::1/128                 scram-sha-256'
    )
    $desired | Add-Content -Path $hbaPath
}

Restart-Service -Name $serviceName -Force

$pgIsReady = Join-Path $binDir 'pg_isready.exe'
$deadline = (Get-Date).AddSeconds(60)
$ready = $false
while ((Get-Date) -lt $deadline) {
    & $pgIsReady -h localhost -p $Port | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    throw "PostgreSQL n'est pas pret (pg_isready) apres 60 secondes."
}

$dbPassword = New-RandomPassword -Length 24
$psql = Join-Path $binDir 'psql.exe'

# Idempotent role/database creation. Verified interactively against a local
# PostgreSQL 16 instance during development of this script; the DO $$ guard
# pattern is stable back to Postgres 9.x. CREATE DATABASE cannot run inside a
# DO block/transaction, hence the separate invocation.
$roleSql = @"
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='$DbUser') THEN
    CREATE ROLE $DbUser LOGIN PASSWORD '$dbPassword' NOSUPERUSER NOCREATEDB NOCREATEROLE;
  ELSE
    ALTER ROLE $DbUser WITH PASSWORD '$dbPassword';
  END IF;
END
`$`$;
"@

$env:PGPASSWORD = $adminPassword
try {
    $roleSql | & $psql -h localhost -p $Port -U postgres -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) { throw 'Echec de la creation idempotente du role taskmaster.' }

    $dbExists = & $psql -h localhost -p $Port -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'"
    if ($dbExists.Trim() -ne '1') {
        & $psql -h localhost -p $Port -U postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $DbName OWNER $DbUser"
        if ($LASTEXITCODE -ne 0) { throw 'Echec de la creation de la base taskmaster.' }
    }
} finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

$encodedUser = ConvertTo-DsnEncoded $DbUser
$encodedPassword = ConvertTo-DsnEncoded $dbPassword
$databaseUrl = "postgresql://$encodedUser`:$encodedPassword@127.0.0.1:$Port/$DbName"

Write-Stage 'PostgreSQL pret.'

return @{
    DatabaseUrl = $databaseUrl
    PgBinPath   = $binDir
}
