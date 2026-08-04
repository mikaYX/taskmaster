#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Expands a staged zip (app.zip or runtime/node-runtime.zip) into its target
  install directory. Invoked by a deferred MSI custom action - the Taskmaster
  app/ and embedded Node runtime are shipped as single zips rather than one
  MSI Component per file, since a full node_modules tree (70k+ files) exceeds
  the MSI 65536-Component hard limit.

.NOTES
  Cannot be executed/verified in this environment - requires a real Windows
  Server 2019 x64 host. See docs/windows-server-2019-local.md.
#>
param(
    [Parameter(Mandatory)] [string] $ArchivePath,
    [Parameter(Mandatory)] [string] $DestinationDir
)

$ErrorActionPreference = 'Stop'

# MSI directory properties (APPFOLDER/NODEFOLDER) always end in "\". Passing
# a string ending in "\" as an argument to a NATIVE executable (tar.exe
# below) hits the classic CommandLineToArgvW ambiguity: PowerShell's own
# argument-to-command-line quoting doesn't double that trailing backslash,
# so the child process sees an escaped closing quote instead of a path
# separator (tar.exe ends up trying to chdir into 'app"' - a literal quote
# stuck on the end - and fails immediately). Stripping the trailing
# separator here sidesteps the whole class of bug.
$DestinationDir = $DestinationDir.TrimEnd('\', '/')

# Self-contained (no Taskmaster.Common.psm1 import): this script is shipped
# as an MSI payload file, not run from a repo checkout, so it cannot rely on
# a sibling common/ folder being present next to it on the target machine.
if (-not (Test-Path $ArchivePath)) {
    throw "Archive introuvable : $ArchivePath"
}

Write-Host "==> Extraction de $(Split-Path $ArchivePath -Leaf)..." -ForegroundColor Cyan

# Defensively stop the Taskmaster service if it's still running, regardless
# of what the MSI's own Installed/REINSTALL-gated UninstallService action
# decided to do. That action only fires when MSI's database considers the
# product currently installed - but a PREVIOUS install attempt that failed
# partway through (after InstallService ran, before the whole transaction
# failed) leaves the service running as an untracked side effect, since MSI
# rollback doesn't automatically undo a plain deferred custom action. The
# service's own node.exe then holds files open under app/ or runtime/node/,
# so purging+re-extracting below fails with "file in use" (MSI error 1722) -
# confirmed on a real install. Idempotent: a no-op when nothing is running.
$existingService = Get-Service -Name 'Taskmaster' -ErrorAction SilentlyContinue
if ($existingService -and $existingService.Status -ne 'Stopped') {
    Write-Host '==> Arret du service Taskmaster existant avant extraction...' -ForegroundColor Cyan
    Stop-Service -Name 'Taskmaster' -Force -ErrorAction SilentlyContinue
    $deadline = (Get-Date).AddSeconds(15)
    while ((Get-Service -Name 'Taskmaster' -ErrorAction SilentlyContinue).Status -ne 'Stopped' -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
    }
}

# The zip is the only MSI-tracked file in $DestinationDir - everything else
# extracted from it is invisible to MSI's file tracking. Purge any prior
# extracted content first, so files removed between versions (upgrade) don't
# linger as orphans. Compared by filename (not resolved full path): comparing
# full paths here previously deleted the archive itself before extraction on
# some machines (Resolve-Path vs Get-ChildItem's FullName can normalize a
# short/8.3 path segment like TEMP differently, so the string comparison
# never matched).
$archiveName = Split-Path $ArchivePath -Leaf
Get-ChildItem -LiteralPath $DestinationDir -Force |
    Where-Object { $_.Name -ne $archiveName } |
    Remove-Item -Recurse -Force

# tar.exe (bundled since Windows 10 1803 / Server 2019) rather than
# Expand-Archive - the latter takes 10+ minutes on a node_modules-sized
# archive (tens of thousands of small files); tar is a couple of seconds.
& tar.exe -x -f $ArchivePath -C $DestinationDir
if ($LASTEXITCODE -ne 0) { throw "tar extraction failed for $ArchivePath (exit $LASTEXITCODE)" }
Remove-Item -LiteralPath $ArchivePath -Force

Write-Host "==> Extraction terminee : $DestinationDir" -ForegroundColor Cyan
