#Requires -Version 5.1
# Exercises failure reporting without installing a service or touching app data.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common\Taskmaster.Common.ps1')
Assert-WindowsX64
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('taskmaster verify ' + [Guid]::NewGuid().ToString('N'))
try {
    New-Item -ItemType Directory -Path (Join-Path $testRoot 'config') -Force | Out-Null
    $sentinel = 'test-only-secret-must-not-appear'
    Set-Content -Path (Join-Path $testRoot 'config\.env') -Value "SERVICE_TEST_SECRET=$sentinel"
    $reportPath = Join-Path $testRoot 'report.json'
    $stdout = Join-Path $testRoot 'stdout.log'
    $stderr = Join-Path $testRoot 'stderr.log'
    $scriptPath = Join-Path $PSScriptRoot 'verify-installation.ps1'
    $arguments = @('-NoProfile', '-File', "`"$scriptPath`"", '-DataDir', "`"$testRoot`"", '-InstallDir', "`"$testRoot\missing-app`"", '-Port', '65500', '-ExpectedEnvHash', ('0' * 64), '-ReportPath', "`"$reportPath`"")
    $process = Start-Process -FilePath 'powershell.exe' -ArgumentList $arguments -Wait -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    if ($process.ExitCode -ne 1) { throw 'Failed verification did not return exit code 1.' }
    $json = Get-Content $reportPath -Raw
    $report = $json | ConvertFrom-Json
    if ($report.passed -ne $false) { throw 'A failed installation was reported as successful.' }
    if ($report.checks.'Configuration conservee apres mise a niveau' -ne $false) { throw 'Configuration mismatch was not detected.' }
    $output = $json + (Get-Content $stdout -Raw) + (Get-Content $stderr -Raw)
    if ($output.Contains($sentinel) -or $output.Contains('SERVICE_TEST_SECRET')) { throw 'Verification output exposed configuration content.' }
    Write-Host 'Installation verification failure/redaction checks passed.'
} finally {
    if (Test-Path $testRoot) { Remove-Item -Path $testRoot -Recurse -Force }
}
