#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Stops and removes the Taskmaster Windows Service only. Never touches
  ProgramData\Taskmaster (config/data/uploads/backups/logs), PostgreSQL, or
  Memurai - those survive a default uninstall by design. Invoked by the MSI's
  uninstall custom action.

.NOTES
  Cannot be executed/verified in this environment - requires a real Windows
  Server 2019 x64 host. See docs/windows-server-2019-local.md.
#>
param(
    [string] $ServiceDir = 'C:\Program Files\Taskmaster\service'
)

. (Join-Path $PSScriptRoot '..\common\Taskmaster.Common.ps1')

$exePath = Join-Path $ServiceDir 'taskmaster-service.exe'

$existing = Get-Service -Name 'Taskmaster' -ErrorAction SilentlyContinue
if (-not $existing) {
    Write-Stage 'Service Taskmaster deja absent, rien a faire.'
    exit 0
}

Write-Stage 'Arret du service Taskmaster...'
if ($existing.Status -ne 'Stopped') {
    if (Test-Path $exePath) {
        & $exePath stop
    } else {
        Stop-Service -Name 'Taskmaster' -Force -ErrorAction SilentlyContinue
    }
}

Write-Stage 'Suppression du service Taskmaster...'
if (Test-Path $exePath) {
    & $exePath uninstall
} else {
    & sc.exe delete Taskmaster | Out-Null
}

Write-Stage 'Service Taskmaster supprime (ProgramData conserve).'
