#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Reset interactif de la base PostgreSQL LOCALE de Taskmaster (DROP + CREATE),
  pour recommencer le Setup Wizard. Conserve .env, uploads, backups et logs.

.DESCRIPTION
  - Lit DATABASE_URL dans C:\ProgramData\Taskmaster\config\.env
  - Refuse de toucher une base non locale (localhost / 127.0.0.1 / ::1)
  - Localise psql.exe via le service Windows PostgreSQL (sinon recherche disque)
  - Propose un pg_dump de sauvegarde, puis demande une confirmation explicite
  - Arrete le service Taskmaster, recree la base, relance le service

  Different de purge-full.ps1 : ne supprime PAS ProgramData et ne depend pas
  d'un chemin PostgreSQL code en dur.
#>
param(
    [string] $DataDir = 'C:\ProgramData\Taskmaster',
    [string] $InstallDir = 'C:\Program Files\Taskmaster\app',
    [string] $ServiceName = 'Taskmaster',
    [string] $HealthUrl = 'http://localhost:3000/api/health'
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Confirm-Yes($question) {
    $a = Read-Host "$question [o/N]"
    return $a -match '^(o|oui|y|yes)$'
}

# --- 1. DATABASE_URL -------------------------------------------------------
Write-Step 'Lecture de la configuration'
$envFile = Join-Path $DataDir 'config\.env'
if (-not (Test-Path $envFile)) { throw "Fichier introuvable : $envFile" }

$line = Get-Content $envFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
if (-not $line) { throw "DATABASE_URL introuvable dans $envFile" }
$raw = ($line -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
$uri = [Uri]$raw

$dbHost = $uri.Host
$dbPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
$dbName = $uri.AbsolutePath.TrimStart('/')
$dbUser = [Uri]::UnescapeDataString($uri.UserInfo.Split(':')[0])

if ($dbHost -notin @('localhost', '127.0.0.1', '::1', '[::1]')) {
    throw "La base est sur un hote externe ($dbHost) : ce script ne la supprimera jamais."
}
# Les noms sont interpoles dans du SQL entre guillemets : on n'accepte que des identifiants simples.
if ($dbName -notmatch '^[A-Za-z0-9_]+$' -or $dbUser -notmatch '^[A-Za-z0-9_]+$') {
    throw "Nom de base ou de role inattendu (base='$dbName', role='$dbUser') : abandon."
}
Write-Host "Base : $dbName  |  Role proprietaire : $dbUser  |  ${dbHost}:$dbPort"

# --- 2. Localiser psql.exe -------------------------------------------------
Write-Step 'Recherche de PostgreSQL'
$psql = $null
$pgSvc = Get-CimInstance Win32_Service |
    Where-Object { $_.Name -match 'postgres' -and $_.PathName -match 'pg_ctl\.exe' } |
    Select-Object -First 1
if ($pgSvc -and $pgSvc.PathName -match '^"?([^"]+?)\\pg_ctl\.exe') {
    $candidate = Join-Path $Matches[1] 'psql.exe'
    if (Test-Path $candidate) { $psql = $candidate }
}
if (-not $psql) {
    Write-Host 'Service PostgreSQL non exploitable, recherche sur les disques fixes...' -ForegroundColor Yellow
    foreach ($d in (Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root -match '^[A-Z]:\\$' })) {
        $psql = Get-ChildItem $d.Root -Recurse -Filter psql.exe -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match 'PostgreSQL' } |
            Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
        if ($psql) { break }
    }
}
if (-not $psql) {
    $psql = Read-Host 'psql.exe introuvable. Saisissez son chemin complet'
    if (-not (Test-Path $psql)) { throw "Introuvable : $psql" }
}
$pgBin = Split-Path $psql
Write-Host "psql : $psql"

# --- 3. Identifiants superutilisateur -------------------------------------
$adminUser = Read-Host 'Superutilisateur PostgreSQL [postgres]'
if (-not $adminUser) { $adminUser = 'postgres' }
$secure = Read-Host "Mot de passe de '$adminUser'" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

function Invoke-Psql([string]$sql, [string]$db = 'postgres') {
    $out = & $psql -h 127.0.0.1 -p $dbPort -U $adminUser -d $db -v ON_ERROR_STOP=1 -tAc $sql 2>&1
    if ($LASTEXITCODE -ne 0) { throw "psql a echoue : $out" }
    return ($out | Out-String).Trim()
}

try {
    Write-Step 'Verification de la connexion'
    $ver = Invoke-Psql 'SHOW server_version;'
    Write-Host "Connecte a PostgreSQL $ver"

    if ((Invoke-Psql "SELECT 1 FROM pg_roles WHERE rolname='$dbUser';") -ne '1') {
        throw "Le role '$dbUser' n'existe pas : relancez plutot l'installeur."
    }
    $exists = (Invoke-Psql "SELECT 1 FROM pg_database WHERE datname='$dbName';") -eq '1'
    if ($exists) {
        $size = Invoke-Psql "SELECT pg_size_pretty(pg_database_size('$dbName'));"
        Write-Host "La base '$dbName' existe ($size)."
    } else {
        Write-Host "La base '$dbName' n'existe pas encore : elle sera simplement creee." -ForegroundColor Yellow
    }

    # --- 4. Sauvegarde optionnelle ----------------------------------------
    if ($exists -and (Confirm-Yes 'Faire une sauvegarde (pg_dump) avant suppression ?')) {
        $pgDump = Join-Path $pgBin 'pg_dump.exe'
        if (-not (Test-Path $pgDump)) { throw "pg_dump.exe introuvable dans $pgBin" }
        $backupDir = Join-Path $DataDir 'backups'
        if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir | Out-Null }
        $dump = Join-Path $backupDir ("pre-reset-{0}.dump" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
        & $pgDump -h 127.0.0.1 -p $dbPort -U $adminUser -Fc -f $dump $dbName
        if ($LASTEXITCODE -ne 0) { throw 'pg_dump a echoue : abandon, rien n''a ete supprime.' }
        Write-Host "Sauvegarde : $dump" -ForegroundColor Green
    }

    # --- 5. Confirmations --------------------------------------------------
    Write-Host ''
    Write-Host 'ATTENTION : toutes les donnees de la base seront supprimees definitivement.' -ForegroundColor Yellow
    Write-Host "Actions : arret du service '$ServiceName', DROP + CREATE de '$dbName', relance du service."
    Write-Host "Conserves : $envFile, uploads, backups, logs."
    if (-not (Confirm-Yes 'Etes-vous sur ? Il suffira ensuite de relancer le service pour refaire le Setup Wizard')) {
        Write-Host 'Annule. Rien n''a ete modifie.'
        return
    }
    $typed = Read-Host "Tapez le nom exact de la base pour confirmer ($dbName)"
    if ($typed -ne $dbName) { Write-Host 'Nom incorrect : annule.' -ForegroundColor Red; return }

    # --- 6. Arret du service ----------------------------------------------
    Write-Step "Arret du service $ServiceName"
    $svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if (-not $svc) { throw "Service '$ServiceName' introuvable." }
    if ($svc.Status -ne 'Stopped') {
        try { Stop-Service -Name $ServiceName -Force -ErrorAction Stop }
        catch { & sc.exe stop $ServiceName | Out-Null }
        (Get-Service $ServiceName).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(60))
    }
    Write-Host 'Service arrete.'

    # --- 7. Reset ---------------------------------------------------------
    Write-Step 'Recreation de la base'
    Invoke-Psql "DROP DATABASE IF EXISTS `"$dbName`" WITH (FORCE);" | Out-Null
    Invoke-Psql "CREATE DATABASE `"$dbName`" OWNER `"$dbUser`";" | Out-Null
    Write-Host "Base '$dbName' recreee (vide)." -ForegroundColor Green
}
finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}

# --- 8. Migrations Prisma ----------------------------------------------------
# Le service ne les applique PAS au demarrage (seul l'installeur le fait) :
# sans cette etape, la base est vide et l'application ne devient jamais prete.
Write-Step 'Creation des tables (prisma migrate deploy)'
$nodeExe = Join-Path $InstallDir '..\runtime\node\node.exe'
$prismaCli = Join-Path $InstallDir 'node_modules\prisma\build\index.js'
if (-not (Test-Path $nodeExe) -or -not (Test-Path $prismaCli)) {
    throw "node.exe ou prisma introuvable sous $InstallDir : lancez 'prisma migrate deploy' manuellement avant de demarrer le service."
}
Push-Location $InstallDir
try {
    $env:TASKMASTER_ENV_FILE = $envFile
    $env:DATABASE_URL = $raw
    $env:CHECKPOINT_DISABLE = '1'
    & $nodeExe $prismaCli migrate deploy --schema=./prisma/schema.prisma
    if ($LASTEXITCODE -ne 0) { throw 'prisma migrate deploy a echoue : le service n''est pas relance.' }
} finally {
    Pop-Location
    Remove-Item Env:\TASKMASTER_ENV_FILE, Env:\DATABASE_URL, Env:\CHECKPOINT_DISABLE -ErrorAction SilentlyContinue
}

# --- 9. Relance --------------------------------------------------------------
Write-Step "Demarrage du service $ServiceName"
Start-Service -Name $ServiceName
(Get-Service $ServiceName).WaitForStatus('Running', [TimeSpan]::FromSeconds(60))

Write-Host 'Attente de la reponse de l''application...'
$ok = $false
for ($i = 0; $i -lt 30 -and -not $ok; $i++) {
    Start-Sleep -Seconds 2
    try { $ok = (Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { }
}
if ($ok) {
    Write-Host "Taskmaster repond ($HealthUrl). Ouvrez l'application pour refaire le Setup Wizard." -ForegroundColor Green
} else {
    Write-Host "Le service tourne mais $HealthUrl ne repond pas encore." -ForegroundColor Yellow
    Write-Host "Consultez les derniers logs dans $DataDir\logs (le demarrage de Node peut prendre ~25 s a 60 s)."
}
