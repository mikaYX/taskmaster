<#
.SYNOPSIS
  Shared helpers for the Taskmaster Windows installer scripts (service install,
  PostgreSQL/Memurai provisioning, build, test-install, purge).

  Authored for Windows PowerShell 5.1+ / PowerShell 7+. None of this can be
  executed or verified outside a real Windows machine - see
  docs/windows-server-2019-local.md for the acceptance checklist that must be
  run there.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-WindowsX64 {
    <# Refuses to run anywhere except a 64-bit Windows host. #>
    if ($env:OS -ne 'Windows_NT') {
        throw 'This script must run on Windows.'
    }
    if (-not [Environment]::Is64BitOperatingSystem) {
        throw 'This script must run on a 64-bit Windows host.'
    }
    if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64' -and $env:PROCESSOR_ARCHITEW6432 -ne 'AMD64') {
        throw 'This script must run on x64 (AMD64).'
    }
}

function Write-Stage {
    <# Prints a French-language progress line, consistent with the Setup.exe wizard stages. #>
    param(
        [Parameter(Mandatory)] [string] $Message
    )
    Write-Host "==> $Message" -ForegroundColor Cyan
}

function New-RandomSecret {
    <# Cryptographically random secret, base64url-encoded (no padding), for AUTH_SECRET / BOOTSTRAP_SECRET / BACKUP_ENCRYPTION_KEY. #>
    param(
        [int] $Bytes = 48
    )
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $buffer = New-Object byte[] $Bytes
        $rng.GetBytes($buffer)
        $b64 = [Convert]::ToBase64String($buffer)
        return $b64.TrimEnd('=').Replace('+', '-').Replace('/', '_')
    } finally {
        $rng.Dispose()
    }
}

function New-RandomPassword {
    <# Cryptographically random alphanumeric password (safe to embed in a DSN without extra escaping). #>
    param(
        [int] $Length = 24
    )
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $bytes = New-Object byte[] $Length
        $rng.GetBytes($bytes)
        $chars = for ($i = 0; $i -lt $Length; $i++) { $alphabet[$bytes[$i] % $alphabet.Length] }
        return -join $chars
    } finally {
        $rng.Dispose()
    }
}

function ConvertTo-DsnEncoded {
    <# Percent-encodes a DATABASE_URL user/password component (RFC 3986 userinfo). #>
    param([Parameter(Mandatory)] [string] $Value)
    [System.Uri]::EscapeDataString($Value)
}

# Well-known SIDs (locale-independent) for BUILTIN\Administrators and
# NT AUTHORITY\SYSTEM, used with icacls's `*SID` syntax below. Confirmed on a
# real (French-localized) Windows Server install: constructing a
# FileSystemAccessRule/NTAccount from the ENGLISH name string
# ('BUILTIN\Administrators') round-trips fine on its own, but AddAccessRule
# throws "Some or all identity references could not be translated" - .NET's
# ACL merge internals need to resolve that identity against the OS's actual
# (here: French) display name for that alias, which the English string
# doesn't match. SIDs are language-independent and always resolve correctly
# regardless of the target machine's locale.
$script:BuiltinAdministratorsSid = 'S-1-5-32-544'
$script:NtAuthoritySystemSid = 'S-1-5-18'

function Protect-TaskmasterConfigAcl {
    <#
      Restricts read access on the ProgramData\Taskmaster\config directory (and
      its .env file) to Administrators, SYSTEM, and the Taskmaster service
      account. Never grants Users/Everyone.

      Uses icacls.exe rather than Get-Acl/Set-Acl: those cmdlets need
      Microsoft.PowerShell.Security, and loading that module a second time in
      the same process - which reliably happens under Burn's elevated
      ExePackage - throws a "TypeData member already present" error that
      turned out to be genuinely unsuppressable (tried -ErrorAction,
      $ErrorActionPreference save/restore at multiple call sites, a fresh
      DirectorySecurity object instead of one from Get-Acl - all failed the
      same way across several real install attempts). icacls is a separate
      native exe, entirely unaffected by any of this.
    #>
    param(
        [Parameter(Mandatory)] [string] $Path,
        [string] $ServiceAccount = 'NT AUTHORITY\LocalService'
    )
    & icacls.exe $Path /inheritance:r | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "icacls /inheritance:r a echoue sur $Path (code $LASTEXITCODE)." }
    & icacls.exe $Path /grant:r "*${script:BuiltinAdministratorsSid}:(OI)(CI)F" "*${script:NtAuthoritySystemSid}:(OI)(CI)F" "${ServiceAccount}:(OI)(CI)RX" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "icacls /grant a echoue sur $Path (code $LASTEXITCODE)." }
}

function Grant-TaskmasterDataAcl {
    <# Grants the service account modify rights on a ProgramData\Taskmaster data subfolder. Uses icacls.exe - see Protect-TaskmasterConfigAcl. #>
    param(
        [Parameter(Mandatory)] [string] $Path,
        [string] $ServiceAccount = 'NT AUTHORITY\LocalService'
    )
    & icacls.exe $Path /grant "${ServiceAccount}:(OI)(CI)M" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "icacls /grant a echoue sur $Path (code $LASTEXITCODE)." }
}

function New-EnvFileIfMissing {
    <#
      Writes C:\ProgramData\Taskmaster\config\.env only if it does not already
      exist. Never overwrites an existing file (upgrade/repair safety) and never
      logs the values it writes.
    #>
    param(
        [Parameter(Mandatory)] [string] $Path,
        [Parameter(Mandatory)] [hashtable] $Values
    )
    if (Test-Path $Path) {
        Write-Stage "Configuration existante conservee : $Path"
        return $false
    }
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

    $lines = foreach ($key in $Values.Keys) { "$key=$($Values[$key])" }
    # No -Verbose/-Debug output here by design: this file contains secrets.
    Set-Content -Path $Path -Value $lines -Encoding UTF8 -NoNewline:$false
    return $true
}

function Wait-ForTcpPort {
    <# Blocks until host:port accepts a TCP connection, or throws after TimeoutSeconds. #>
    param(
        [Parameter(Mandatory)] [string] $ComputerName,
        [Parameter(Mandatory)] [int] $Port,
        [int] $TimeoutSeconds = 60,
        [string] $Label = "$ComputerName`:$Port"
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $delayMs = 500
    while ((Get-Date) -lt $deadline) {
        try {
            $client = New-Object System.Net.Sockets.TcpClient
            $task = $client.ConnectAsync($ComputerName, $Port)
            if ($task.Wait(2000) -and $client.Connected) {
                $client.Close()
                Write-Stage "$Label est joignable."
                return
            }
            $client.Close()
        } catch {
            # ignore and retry
        }
        Start-Sleep -Milliseconds $delayMs
        $delayMs = [Math]::Min($delayMs * 1.5, 5000)
    }
    throw "Timeout: $Label n'est pas joignable apres $TimeoutSeconds secondes."
}

function Test-RedisPingable {
    <# Sends a raw RESP PING and checks for +PONG - works against Redis and Memurai alike. #>
    param(
        [Parameter(Mandatory)] [string] $ComputerName,
        [Parameter(Mandatory)] [int] $Port,
        [int] $TimeoutMs = 2000
    )
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        if (-not $client.ConnectAsync($ComputerName, $Port).Wait($TimeoutMs)) { return $false }
        $stream = $client.GetStream()
        $stream.ReadTimeout = $TimeoutMs
        $bytes = [System.Text.Encoding]::ASCII.GetBytes("PING`r`n")
        $stream.Write($bytes, 0, $bytes.Length)
        $buffer = New-Object byte[] 32
        $read = $stream.Read($buffer, 0, $buffer.Length)
        $response = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $read)
        $client.Close()
        return $response.StartsWith('+PONG')
    } catch {
        return $false
    }
}

function Assert-FileHash {
    <# Verifies a downloaded/staged payload's SHA-256 against an expected value before use. #>
    param(
        [Parameter(Mandatory)] [string] $Path,
        [Parameter(Mandatory)] [string] $ExpectedSha256
    )
    if (-not (Test-Path $Path)) {
        throw "Payload introuvable : $Path"
    }
    $actual = (Get-FileHash -Path $Path -Algorithm SHA256).Hash
    if ($actual.ToUpperInvariant() -ne $ExpectedSha256.ToUpperInvariant()) {
        throw "SHA-256 mismatch for $Path`nExpected: $ExpectedSha256`nActual:   $actual"
    }
}

# No Export-ModuleMember here: this file is dot-sourced (`. path\to\this.psm1`)
# everywhere it's used, not Import-Module'd - Export-ModuleMember only works
# inside an actual module-loading context and, called outside one, silently
# prevented EVERY function above from ever reaching the caller's scope
# (confirmed by direct testing: dot-sourcing completed without throwing, yet
# not one of this file's 11 functions was defined afterward). Switching to
# dot-sourcing itself was necessary to route around a separate PowerShell 5.1
# quirk: Import-Module-ing this file was the trigger for "TypeData member
# already present" duplicate-registration errors under Burn's elevated
# ExePackage process (see the Microsoft.PowerShell.Security preload comment
# above) - confirmed across several real install attempts.
