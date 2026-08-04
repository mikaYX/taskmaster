#Requires -RunAsAdministrator
<#
.SYNOPSIS
  Opens the Windows Firewall for the Taskmaster application port, and only
  that port - PostgreSQL (5432) and Memurai (6379) are never exposed, whether
  this script runs or not. Invoked only when the administrator chose "LAN
  access" in the Setup.exe wizard; skipped entirely for a local-only install
  (the app still binds all interfaces either way - see main.ts - exposure is
  controlled purely by firewall rule presence).

.NOTES
  Cannot be executed/verified in this environment - requires a real Windows
  Server 2019 x64 host.
#>
param(
    [Parameter(Mandatory)] [int] $Port
)

. (Join-Path $PSScriptRoot '..\common\Taskmaster.Common.ps1')
Assert-WindowsX64

Write-Stage "Ouverture du port $Port dans le pare-feu Windows (acces LAN)..."

$ruleName = 'Taskmaster'
Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -LocalPort $Port `
    -Protocol TCP `
    -Action Allow `
    -Profile Any | Out-Null

Write-Stage "Regle de pare-feu creee pour le port $Port uniquement."
