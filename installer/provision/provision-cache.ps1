#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Provisions the Redis-compatible cache Taskmaster requires (BullMQ, login
  lockout, refresh-token rotation locks, rate limiting, scheduler locks - see
  docs/windows-server-2019-local.md for why this is not optional). Installs
  Memurai locally from an operator-supplied payload, or is skipped entirely
  when the administrator chose "use an existing Redis-compatible server".

.OUTPUTS
  Hashtable: @{ RedisUrl = '...' }

.NOTES
  Memurai is proprietary and cannot be redistributed by this project - its
  installer must be placed in installer/payloads/ by the operator before
  build.ps1 runs (see installer/payloads/README.md). Cannot be
  executed/verified in this environment - requires a real Windows Server 2019
  x64 host.
#>
param(
    [string] $InstallerMsiPath, # from installer/payloads/, required only when -UseLocal is set
    [switch] $UseLocal,
    [string] $ExistingRedisUrl,
    [int] $Port = 6379
)

. (Join-Path $PSScriptRoot '..\common\Taskmaster.Common.ps1')
Assert-WindowsX64

Write-Stage 'Installation du cache...'

if (-not $UseLocal) {
    if (-not $ExistingRedisUrl) {
        throw 'ExistingRedisUrl is required when -UseLocal is not set.'
    }
    Write-Stage "Utilisation du serveur Redis-compatible existant : $ExistingRedisUrl"
    return @{ RedisUrl = $ExistingRedisUrl }
}

if (-not $InstallerMsiPath -or -not (Test-Path $InstallerMsiPath)) {
    throw "Memurai installer not found at $InstallerMsiPath. Place it in installer/payloads/ per installer/payloads/README.md."
}

$serviceName = 'Memurai'
$existing = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if (-not $existing) {
    Write-Stage 'Execution du programme d''installation Memurai (silencieux)...'
    # Exact silent-install flags must be confirmed against Memurai's own
    # documentation at build time (proprietary product, flags may change
    # between releases) - msiexec /quiet is the standard MSI convention and
    # is expected to apply, but build.ps1 must verify this against the
    # specific payload version placed in installer/payloads/.
    $proc = Start-Process -FilePath 'msiexec.exe' -ArgumentList @(
        '/i', "`"$InstallerMsiPath`"",
        '/quiet', '/norestart'
    ) -Wait -PassThru
    if ($proc.ExitCode -ne 0) {
        throw "Memurai installer exited with code $($proc.ExitCode)"
    }
} else {
    Write-Stage 'Memurai deja installe, reutilisation du service existant.'
}

# Bind to loopback only - no firewall rule is ever added for 6379.
$memuraiConf = 'C:\Program Files\Memurai\memurai.conf'
if (Test-Path $memuraiConf) {
    (Get-Content $memuraiConf) -replace '^#?\s*bind\s+.*', 'bind 127.0.0.1' | Set-Content $memuraiConf
    Restart-Service -Name $serviceName -Force
}

Wait-ForTcpPort -ComputerName '127.0.0.1' -Port $Port -TimeoutSeconds 60 -Label 'Memurai'
if (-not (Test-RedisPingable -ComputerName '127.0.0.1' -Port $Port)) {
    throw 'Memurai ne repond pas au PING sur 127.0.0.1:6379.'
}

Write-Stage 'Cache pret.'

return @{
    RedisUrl = "redis://127.0.0.1:$Port"
}
