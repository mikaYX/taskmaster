#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Acceptance test for a built Setup.exe: silent install, health checklist,
  upgrade-in-place, and default-uninstall (data-preserving) scenarios. Run
  this on a clean (or disposable/snapshot-able) Windows Server 2019 x64 VM -
  never on a machine you care about, since it installs real services.

  Exits non-zero and prints a clear failure summary (service name, log path,
  NEVER a secret) if any check fails - this script must never report success
  when a check failed.

.NOTES
  Cannot be executed in this environment - requires a real Windows Server
  2019 x64 host with the built Taskmaster-Setup-<version>-x64.exe. See
  docs/windows-server-2019-local.md for the full manual acceptance checklist
  this script automates.
#>
param(
    [Parameter(Mandatory)] [string] $SetupExePath,
    [string] $PreviousSetupExePath, # optional: older version, to exercise the upgrade scenario first
    [int] $Port = 3000
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common\Taskmaster.Common.ps1')
Assert-WindowsX64

$logPath = 'C:\ProgramData\Taskmaster\logs\install.log'
$failures = @()

function Test-Checklist {
    param([string] $Label)
    Write-Stage "Controle : $Label"

    $results = @{}
    $results['Service PostgreSQL'] = (Get-Service -Name 'postgresql-x64-17' -ErrorAction SilentlyContinue).Status -eq 'Running'
    $results['Service Memurai'] = (Get-Service -Name 'Memurai' -ErrorAction SilentlyContinue).Status -eq 'Running'
    $results['Service Taskmaster'] = (Get-Service -Name 'Taskmaster' -ErrorAction SilentlyContinue).Status -eq 'Running'

    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/health" -UseBasicParsing -TimeoutSec 10
        $results['GET /api/health'] = $resp.StatusCode -eq 200
    } catch { $results['GET /api/health'] = $false }

    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 10
        $results['GET /'] = $resp.StatusCode -eq 200
    } catch { $results['GET /'] = $false }

    $results['client/index.html present'] = Test-Path 'C:\Program Files\Taskmaster\app\client\index.html'

    foreach ($key in $results.Keys) {
        $status = if ($results[$key]) { 'OK' } else { 'ECHEC' }
        $color = if ($results[$key]) { 'Green' } else { 'Red' }
        Write-Host ("  [{0}] {1}" -f $status, $key) -ForegroundColor $color
        if (-not $results[$key]) { $script:failures += "$Label : $key" }
    }
}

# ---- Optional: upgrade-in-place scenario -----------------------------------
if ($PreviousSetupExePath) {
    Write-Stage 'Scenario de mise a niveau : installation de la version precedente...'
    Start-Process -FilePath $PreviousSetupExePath -ArgumentList '/quiet' -Wait
    Test-Checklist -Label 'Apres installation initiale (version precedente)'

    # Record something an upgrade must preserve: the generated secrets.
    $envBefore = Get-Content 'C:\ProgramData\Taskmaster\config\.env' -Raw
}

# ---- Fresh / upgrade install of the version under test ---------------------
Write-Stage 'Installation de Setup.exe...'
$proc = Start-Process -FilePath $SetupExePath -ArgumentList '/quiet' -Wait -PassThru
if ($proc.ExitCode -ne 0) {
    $failures += "Setup.exe exit code = $($proc.ExitCode)"
}

Test-Checklist -Label 'Apres installation'

if ($PreviousSetupExePath) {
    $envAfter = Get-Content 'C:\ProgramData\Taskmaster\config\.env' -Raw
    if ($envBefore -ne $envAfter) {
        $failures += 'Mise a niveau : le fichier .env / les secrets ont change (attendu : inchanges).'
    } else {
        Write-Host '  [OK] Secrets/.env inchanges apres mise a niveau' -ForegroundColor Green
    }
}

# ---- Default uninstall: must preserve ProgramData --------------------------
Write-Stage 'Desinstallation par defaut...'
$productCode = (Get-CimInstance Win32_Product -Filter "Name = 'Taskmaster'" -ErrorAction SilentlyContinue).IdentifyingNumber
if ($productCode) {
    Start-Process msiexec.exe -ArgumentList "/x $productCode /quiet" -Wait
}

if (-not (Get-Service -Name 'Taskmaster' -ErrorAction SilentlyContinue)) {
    Write-Host '  [OK] Service Taskmaster supprime' -ForegroundColor Green
} else {
    $failures += 'Desinstallation : le service Taskmaster existe encore.'
}
if (Test-Path 'C:\ProgramData\Taskmaster\config\.env') {
    Write-Host '  [OK] ProgramData (config/.env) conserve' -ForegroundColor Green
} else {
    $failures += 'Desinstallation : ProgramData a ete supprime (attendu : conserve).'
}
if ((Get-Service -Name 'postgresql-x64-17' -ErrorAction SilentlyContinue).Status -eq 'Running') {
    Write-Host '  [OK] PostgreSQL toujours actif' -ForegroundColor Green
} else {
    $failures += 'Desinstallation : le service PostgreSQL ne tourne plus (attendu : conserve actif).'
}

# ---- Result -----------------------------------------------------------------
if ($failures.Count -gt 0) {
    Write-Host ''
    Write-Host 'ECHEC - ce test ne rapporte JAMAIS un succes si un controle a echoue :' -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    Write-Host "Journal (sans secret) : $logPath"
    exit 1
}

Write-Host ''
Write-Host 'Tous les controles sont passes.' -ForegroundColor Green
exit 0
