#Requires -Version 5.1
<#
.SYNOPSIS
  Non-destructive verification after a fresh MSI installation or upgrade.
  Never installs/uninstalls services or restores a database. Run on the target
  Windows VM after using the MSI wizard. Output contains no .env values/secrets.
#>
param(
    [int] $Port = 3000,
    [string] $DataDir = 'C:\ProgramData\Taskmaster',
    [string] $InstallDir = 'C:\Program Files\Taskmaster\app',
    [string] $ExpectedVersion,
    [string] $ExpectedEnvHash,
    [string] $PublicUrl,
    [string] $ReportPath
)

# The service answers in HTTPS when TLS_CERT_FILE is set (usually a self-signed
# certificate), so the local probe tries HTTP first and then HTTPS ignoring the certificate.
function Invoke-LocalProbe {
    param([string]$Path, [int]$Port, [int]$TimeoutSec = 5)
    try {
        return Invoke-WebRequest -Uri "http://127.0.0.1:$Port$Path" -UseBasicParsing -TimeoutSec $TimeoutSec
    } catch {
        $previous = [System.Net.ServicePointManager]::ServerCertificateValidationCallback
        try {
            [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
            if (-not ("TaskmasterTrustAll" -as [type])) {
                Add-Type -TypeDefinition "public class TaskmasterTrustAll { public static bool Accept(object s, System.Security.Cryptography.X509Certificates.X509Certificate c, System.Security.Cryptography.X509Certificates.X509Chain h, System.Net.Security.SslPolicyErrors e) { return true; } }"
            }
            [System.Net.ServicePointManager]::ServerCertificateValidationCallback = [System.Net.Security.RemoteCertificateValidationCallback][TaskmasterTrustAll].GetMethod("Accept").CreateDelegate([System.Net.Security.RemoteCertificateValidationCallback])
            return Invoke-WebRequest -Uri "https://127.0.0.1:$Port$Path" -UseBasicParsing -TimeoutSec $TimeoutSec
        } finally {
            [System.Net.ServicePointManager]::ServerCertificateValidationCallback = $previous
        }
    }
}

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common\Taskmaster.Common.ps1')
Assert-WindowsX64
$checks = [ordered]@{}
$envPath = Join-Path $DataDir 'config\.env'
$checks['Configuration presente'] = Test-Path $envPath -PathType Leaf
$configuration = @{}
if ($checks['Configuration presente']) {
    $configuration = Read-EnvFile -Path $envPath
    if ($configuration['PORT']) { $Port = [int] $configuration['PORT'] }
}
if ($ExpectedEnvHash) {
    $checks['Configuration conservee apres mise a niveau'] = (Test-Path $envPath) -and (Get-FileHash -Path $envPath -Algorithm SHA256).Hash -eq $ExpectedEnvHash
}
$service = Get-CimInstance Win32_Service -Filter "Name='Taskmaster'" -ErrorAction SilentlyContinue
$checks['Service Taskmaster demarre'] = $null -ne $service -and $service.State -eq 'Running'
$checks['Frontend installe'] = Test-Path (Join-Path $InstallDir 'client\index.html') -PathType Leaf
$pgBin = $configuration['PG_BIN_PATH']
$checks['pg_dump.exe disponible'] = [bool]$pgBin -and (Test-Path (Join-Path $pgBin 'pg_dump.exe') -PathType Leaf)
$checks['pg_restore.exe disponible'] = [bool]$pgBin -and (Test-Path (Join-Path $pgBin 'pg_restore.exe') -PathType Leaf)
foreach ($path in @('/api/health', '/')) {
    try {
        $response = Invoke-LocalProbe -Path $path -Port $Port -TimeoutSec 15
        $checks["HTTP local $path"] = $response.StatusCode -eq 200
    } catch { $checks["HTTP local $path"] = $false }
}
if ($ExpectedVersion) {
    try {
        $package = Get-Content (Join-Path $InstallDir 'package.json') -Raw | ConvertFrom-Json
        $checks['Version installee attendue'] = $package.version -eq $ExpectedVersion
    } catch { $checks['Version installee attendue'] = $false }
}
if ($PublicUrl) {
    try {
        $origin = Resolve-TaskmasterPublicUrl -PublicUrl $PublicUrl
        $frontend = Resolve-TaskmasterPublicUrl -PublicUrl $configuration['FRONTEND_URL']
        $checks['URL publique coherente avec FRONTEND_URL'] = $origin -eq $frontend
        $rpId = if ($configuration['RP_ID']) { $configuration['RP_ID'] } else { ([Uri] $frontend).Host }
        # The browser must still perform a real enrollment/login. This request
        # verifies HTTPS connectivity/trust and server options, not a credential.
        $options = Invoke-RestMethod -Uri "$origin/api/auth/passkeys/login/options" -TimeoutSec 15
        $checks['Options passkey et certificat public'] = $options.options.rpId -eq $rpId
    } catch { $checks['Options passkey et certificat public'] = $false }
}
$passed = @($checks.Values | Where-Object { -not $_ }).Count -eq 0
foreach ($entry in $checks.GetEnumerator()) {
    $status = if ($entry.Value) { 'OK' } else { 'ECHEC' }
    Write-Host "[$status] $($entry.Key)"
}
# Only an allowlisted report is serialized. Never serialize $configuration.
$account = if ($service) { $service.StartName } else { $null }
$report = [ordered]@{ checkedAt = (Get-Date).ToUniversalTime().ToString('o'); passed = $passed; serviceAccount = $account; checks = $checks }
if ($ReportPath) { $report | ConvertTo-Json -Depth 4 | Set-Content -Path $ReportPath -Encoding UTF8 }
Write-Host 'Restent obligatoires : sauvegarde via le service, restauration sur instance jetable, enrolement et connexion passkey dans le navigateur.'
if (-not $passed) { exit 1 }
exit 0
