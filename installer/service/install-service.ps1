#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Installs the Taskmaster Windows Service using WinSW. Invoked by a deferred
  MSI custom action during install/upgrade - never run interactively in a way
  that would leave a terminal open (per the "no terminal after install"
  requirement, this script always exits and is never left running).

.NOTES
  Cannot be executed/verified in this environment - requires a real Windows
  Server 2019 x64 host. See docs/windows-server-2019-local.md.
#>
param(
    [string] $ServiceDir = 'C:\Program Files\Taskmaster\service',
    # LocalSystem: the real root cause of the long-standing "service starts,
    # node.exe alive, port 3000 never opens" hang was WinSW spawning node.exe
    # with no console/conhost at all (fixed in taskmaster-service.xml via a
    # cmd.exe /c wrapper) - the service account was never actually the
    # problem. LocalService remains a follow-up worth doing (least privilege)
    # but requires adding explicit util:PermissionEx grants for
    # APPFOLDER/NODEFOLDER/SERVICEFOLDER in Product.wxs first - only
    # TASKMASTERDATAROOT's subfolders grant it access today, and that combo
    # has not been tested end to end yet. Also note: `sc.exe config ... obj=`
    # silently no-ops on the bare string "LocalService" (must be the fully
    # qualified "NT AUTHORITY\LocalService") - confirmed the hard way, this
    # cost significant debugging time before the real cause was found.
    [string] $ServiceAccount = 'LocalSystem',
    # Windows service names Taskmaster should depend on (SCM-level "start
    # this after that"). Only meaningful for LOCALLY installed dependencies
    # (e.g. 'postgresql-x64-17', 'Memurai') - never set this for an
    # "Existing" Postgres/Redis target, which may not even be a Windows
    # service on this machine. taskmaster-service.xml intentionally has no
    # static <depend> for exactly this reason: a hardcoded dependency on a
    # service that doesn't exist makes the SCM refuse to start Taskmaster at
    # all (error 1075) - confirmed on a real Existing-mode install.
    [string[]] $Dependencies = @()
)

. (Join-Path $PSScriptRoot '..\common\Taskmaster.Common.ps1')

Assert-WindowsX64

$exePath = Join-Path $ServiceDir 'taskmaster-service.exe'
$xmlPath = Join-Path $ServiceDir 'taskmaster-service.xml'

if (-not (Test-Path $exePath) -or -not (Test-Path $xmlPath)) {
    throw "WinSW service files not found in $ServiceDir. Expected taskmaster-service.exe and .xml (staged by build.ps1)."
}

Write-Stage 'Installation du service Windows...'

$existing = Get-Service -Name 'Taskmaster' -ErrorAction SilentlyContinue
if ($existing) {
    Write-Stage 'Service Taskmaster deja enregistre, arret avant reconfiguration.'
    if ($existing.Status -ne 'Stopped') {
        & $exePath stop
    }
    & $exePath uninstall
}

& $exePath install
if ($LASTEXITCODE -ne 0) {
    throw "WinSW 'install' failed with exit code $LASTEXITCODE"
}

# WinSW has no native delayed-auto-start flag or "run as" element that avoids
# ever writing a password - configure both via sc.exe instead. LocalService
# has no logon password, so no secret is ever written to the SCM config.
& sc.exe config Taskmaster start= delayed-auto | Out-Null
& sc.exe config Taskmaster obj= $ServiceAccount | Out-Null
if ($Dependencies.Count -gt 0) {
    & sc.exe config Taskmaster depend= ($Dependencies -join '/') | Out-Null
}

Write-Stage 'Demarrage du service Taskmaster...'
& $exePath start
if ($LASTEXITCODE -ne 0) {
    # Not fatal: this script runs twice in a full Setup.exe install - once
    # from the MSI's own InstallService custom action (right after files are
    # extracted, before ProgramData\Taskmaster\config\.env exists yet, so the
    # app cannot start and this is expected), and again from
    # orchestrate-install.ps1 (after .env + Prisma migration are ready, where
    # it should actually succeed). orchestrate-install.ps1 already runs its
    # own post-install health check that verifies the service reached
    # "Running" and fails the overall install with full diagnostics if not -
    # throwing here too would just fail the bare MSI on every install.
    Write-Warning "WinSW 'start' failed with exit code $LASTEXITCODE. Check C:\ProgramData\Taskmaster\logs\Taskmaster.err.log"
} else {
    Write-Stage 'Service Taskmaster installe et demarre.'
}
