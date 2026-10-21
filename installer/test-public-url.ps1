# Pure URL/configuration checks: no service, database, or machine settings modified.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common\Taskmaster.Common.ps1')

function Assert-Equal($Actual, $Expected) {
    if ($Actual -cne $Expected) { throw "Expected '$Expected', got '$Actual'." }
}

Assert-Equal (Resolve-TaskmasterPublicUrl) 'http://localhost:3000'
Assert-Equal (Resolve-TaskmasterPublicUrl -HostName 'serveur' -Port 8080) 'http://serveur:8080'
Assert-Equal (Resolve-TaskmasterPublicUrl -PublicUrl 'https://taskmaster.example.com/') 'https://taskmaster.example.com'
Assert-Equal (Resolve-TaskmasterPublicUrl -PublicUrl 'https://tasks.example.org:8443') 'https://tasks.example.org:8443'
Assert-Equal (Resolve-TaskmasterPublicUrl -PublicUrl 'http://serveur:3000') 'http://serveur:3000'

# Upgrade inputs cannot override the existing public URL. A bad legacy URL
# doesn't block the upgrade; the .env stays untouched and links fall back locally.
Assert-Equal (Resolve-TaskmasterPublicUrl -IsUpgrade -ExistingUrl 'https://existing.example.org/' -PublicUrl 'https://new.example.org') 'https://existing.example.org'
Assert-Equal (Resolve-TaskmasterPublicUrl -IsUpgrade -ExistingUrl 'invalid' -Port 8080) 'http://localhost:8080'
Assert-Equal (Resolve-TaskmasterPublicUrl -IsUpgrade -PublicUrl 'invalid') 'http://localhost:3000'

foreach ($invalid in @('invalid', 'file:///C:/taskmaster', 'ftp://server', 'https://user:secret@server', 'https://server/path', 'https://server/?q=1', 'https://server/#fragment', "https://server/`n")) {
    $rejected = $false
    try { Resolve-TaskmasterPublicUrl -PublicUrl $invalid | Out-Null } catch { $rejected = $true }
    if (-not $rejected) { throw 'An invalid public URL was accepted.' }
}
Write-Host 'Public URL configuration checks passed.'
