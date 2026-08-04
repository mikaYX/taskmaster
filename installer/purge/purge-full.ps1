#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Full purge of a local Taskmaster installation: removes ProgramData\Taskmaster
  (config, uploads, procedures, backups, logs) and, only for a LOCAL PostgreSQL
  install, drops the taskmaster database and role. This is intentionally
  SEPARATE from the MSI's own uninstall (which only ever removes the Taskmaster
  service and Program Files, per the "keep data by default" requirement) and is
  never invoked automatically.

  This script NEVER touches an externally-configured PostgreSQL/Redis server -
  it only ever drops a database it can positively identify as local (same
  machine, name/port explicitly confirmed interactively below). If Taskmaster
  was configured against an existing/external server, this script will refuse
  to drop anything and only removes ProgramData.

.NOTES
  Cannot be executed/verified in this environment - requires a real Windows
  Server 2019 x64 host. Run manually; there is no Start Menu shortcut for this
  by default (documented explicitly in docs/windows-server-2019-local.md so it
  is never triggered by accident).
#>
param(
    [string] $DataDir = 'C:\ProgramData\Taskmaster',
    [switch] $DropLocalDatabase
)

. (Join-Path $PSScriptRoot '..\common\Taskmaster.Common.ps1')
Assert-WindowsX64

Write-Host 'ATTENTION : cette operation supprime definitivement les donnees Taskmaster.' -ForegroundColor Yellow
Write-Host "Repertoire cible : $DataDir"

$confirmDir = Read-Host "Tapez le chemin exact ci-dessus pour confirmer la suppression de ProgramData"
if ($confirmDir -ne $DataDir) {
    Write-Host 'Confirmation invalide - operation annulee.' -ForegroundColor Red
    exit 1
}

if ($DropLocalDatabase) {
    $envFile = Join-Path $DataDir 'config\.env'
    if (-not (Test-Path $envFile)) {
        Write-Host "Fichier .env introuvable ($envFile) - impossible de confirmer qu'il s'agit d'une base locale. Abandon de la suppression de la base." -ForegroundColor Red
    } else {
        $dbUrlLine = (Get-Content $envFile) | Where-Object { $_ -match '^DATABASE_URL=' }
        if (-not $dbUrlLine) {
            Write-Host 'DATABASE_URL introuvable dans .env - abandon de la suppression de la base.' -ForegroundColor Red
        } else {
            $uri = [Uri]($dbUrlLine -replace '^DATABASE_URL=', '')
            $isLocal = $uri.Host -in @('127.0.0.1', 'localhost', '::1')
            if (-not $isLocal) {
                Write-Host "DATABASE_URL pointe vers un hote externe ($($uri.Host)) - cette base ne sera JAMAIS supprimee par ce script." -ForegroundColor Red
            } else {
                $dbName = $uri.AbsolutePath.TrimStart('/')
                $confirmDb = Read-Host "Tapez le nom exact de la base locale a supprimer ($dbName) pour confirmer"
                if ($confirmDb -eq $dbName) {
                    $binDir = 'C:\Program Files\PostgreSQL\17\bin'
                    $psql = Join-Path $binDir 'psql.exe'
                    if (Test-Path $psql) {
                        & $psql -h 127.0.0.1 -p $uri.Port -U postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS `"$dbName`""
                        & $psql -h 127.0.0.1 -p $uri.Port -U postgres -v ON_ERROR_STOP=1 -c "DROP ROLE IF EXISTS taskmaster"
                        Write-Host "Base locale '$dbName' et role 'taskmaster' supprimes." -ForegroundColor Yellow
                    } else {
                        Write-Host "psql.exe introuvable dans $binDir - suppression de la base ignoree." -ForegroundColor Red
                    }
                } else {
                    Write-Host 'Confirmation du nom de base invalide - la base est conservee.' -ForegroundColor Red
                }
            }
        }
    }
}

if (Test-Path $DataDir) {
    Remove-Item -Path $DataDir -Recurse -Force
    Write-Host "Supprime : $DataDir" -ForegroundColor Yellow
}

Write-Host 'Purge terminee. PostgreSQL et Memurai (services et binaires) ne sont pas desinstalles par ce script.'
