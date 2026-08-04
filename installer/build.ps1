#Requires -Version 5.1
<#
.SYNOPSIS
  Reproducible build of the Taskmaster Windows installer
  (Taskmaster-<version>-x64.msi). Setup.exe/Bundle.wxs (bundled local
  PostgreSQL/Memurai via WiX Burn) is no longer built here - every real
  deployment targets an already-provisioned PostgreSQL/Redis server, which
  the MSI's own TaskmasterConfigDlg (UI.wxs) already handles standalone.

  Must run on a Windows x64 build machine - refuses to run anywhere else
  (see Assert-WindowsX64 below). This is the ONLY script in this repository
  that can actually produce the .msi artifact; it cannot be executed in
  a Linux dev container, which is why this file is reviewable source only
  until run for real. See docs/windows-server-2019-local.md.

.NOTES
  Prerequisites on the BUILD machine (not the target server):
    - Node.js >=22 <25 x64 (to run npm/tsc/jest - the runtime embedded in the
      installer is fetched separately, see Get-NodeRuntime below)
    - npm >=10
    - .NET SDK (for `dotnet tool install --global wix`, WiX Toolset v5)
    - PowerShell 5.1+ (ships with Windows Server 2019) or PowerShell 7+
#>
param(
    [switch] $SkipTests,
    [switch] $Sign
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common\Taskmaster.Common.ps1')

Assert-WindowsX64

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$stagingRoot = Join-Path $PSScriptRoot 'staging'
$distRoot = Join-Path $repoRoot 'dist-installer'

# ---- 1. Tool version checks -------------------------------------------------
Write-Stage 'Verification des outils de build...'
foreach ($tool in @('node', 'npm', 'wix')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "Required build tool not found on PATH: $tool"
    }
}
$nodeVersion = (node --version).TrimStart('v')
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 22 -or $nodeMajor -ge 25) {
    throw "Node $nodeVersion found; this repo requires >=22 <25 (see root package.json engines)."
}

# ---- 2. Version from root package.json (single source of truth) -----------
$rootPackageJson = Get-Content (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
$version = $rootPackageJson.version
if (-not $version) { throw 'Could not read version from root package.json' }
Write-Stage "Construction de Taskmaster v$version"

# ---- 3. npm ci (root) - preserves the `overrides` block automatically -----
# backend's postinstall hook (triggered automatically by npm ci) runs
# `prisma generate`, which loads prisma.config.ts - that file resolves
# DATABASE_URL eagerly and throws if it isn't set, even though `generate`
# never connects to a database. A dummy build-time value avoids requiring a
# real database on the build machine (same fix as Dockerfile's ENV DATABASE_URL
# before its db:generate step).
$env:DATABASE_URL = 'postgresql://build:build@localhost:5432/build'
Write-Stage 'npm ci (dependances)...'
Push-Location $repoRoot
try {
    & npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }

    # ---- 4. Prisma client generated ON THIS WINDOWS MACHINE ----------------
    # schema.prisma has no binaryTargets override - it auto-detects the
    # generate-time platform, so this MUST run here, never copied from a
    # Linux dev environment, to get the correct native query-engine binary.
    Write-Stage 'Generation du client Prisma (Windows natif)...'
    & npm -w backend run db:generate
    if ($LASTEXITCODE -ne 0) { throw 'prisma generate failed' }

    if (-not $SkipTests) {
        Write-Stage 'Verification de types (typecheck)...'
        & npm run typecheck
        if ($LASTEXITCODE -ne 0) { throw 'typecheck failed' }

        Write-Stage 'Tests...'
        & npm run test
        if ($LASTEXITCODE -ne 0) { throw 'tests failed' }

        Write-Stage 'Lint...'
        & npm run lint
        if ($LASTEXITCODE -ne 0) { throw 'lint failed' }
    }

    # ---- 5. Build (backend + frontend + client/ staging copy) --------------
    Write-Stage 'Build backend + frontend...'
    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'build failed' }
} finally {
    Pop-Location
}

# ---- 6. Clean staging ---------------------------------------------------
Write-Stage 'Preparation du staging...'
if (Test-Path $stagingRoot) {
    # Plain Remove-Item -Recurse intermittently throws "Le repertoire n'est
    # pas vide" partway through a large tree (735MB+ node_modules) even after
    # several retries with delays - confirmed repeatedly, most likely
    # antivirus real-time scanning re-touching files during the walk. robocopy
    # /MIR against an empty source directory is the standard, far more
    # reliable way to forcibly empty a large/actively-scanned Windows
    # directory tree; /MIR's own exit codes are NOT the usual 0=success (0-7
    # is success, 8+ is failure).
    $emptyDir = Join-Path $env:TEMP "taskmaster-empty-$([guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Path $emptyDir -Force | Out-Null
    try {
        & robocopy.exe $emptyDir $stagingRoot /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "robocopy /MIR failed emptying $stagingRoot (code $LASTEXITCODE)." }
    } finally {
        Remove-Item $emptyDir -Recurse -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $stagingRoot -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path (Join-Path $stagingRoot 'app') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stagingRoot 'runtime\node') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stagingRoot 'service') -Force | Out-Null

$appStaging = Join-Path $stagingRoot 'app'
Copy-Item (Join-Path $repoRoot 'backend\dist') (Join-Path $appStaging 'dist') -Recurse
Copy-Item (Join-Path $repoRoot 'backend\prisma') (Join-Path $appStaging 'prisma') -Recurse
Copy-Item (Join-Path $repoRoot 'backend\package.json') (Join-Path $appStaging 'package.json')
Copy-Item (Join-Path $repoRoot 'client') (Join-Path $appStaging 'client') -Recurse
# prisma.config.ts (used everywhere else) needs ts-node/TS compilation and
# reads DATABASE_URL by dotenv-loading a repo-relative .env path that doesn't
# exist once installed - neither applies on the target machine. .cjs is the
# plain-Node, process.env.DATABASE_URL-reading counterpart orchestrate-
# install.ps1's `prisma migrate deploy` step actually needs; without it,
# Prisma has no config file at all in the installed app and fails with
# "datasource.url property is required" - confirmed on a real install.
Copy-Item (Join-Path $repoRoot 'backend\prisma.config.cjs') (Join-Path $appStaging 'prisma.config.cjs')

# ---- 7. Production-only node_modules ---------------------------------------
# npm workspaces hoist shared deps to the root node_modules; to get a single
# self-contained node_modules for the staged app we run `npm ci --omit=dev`
# inside an ISOLATED temp copy of the whole repo (not the dev tree), so
# workspace hoisting resolves the same way it would for a real install.
# NOTE: the exact edge-case behavior of npm workspace hoisting under
# `--omit=dev` has not been proven on a real Windows box yet - treat this
# step as the first thing to validate when this script is actually run.
Write-Stage 'Installation des dependances de production...'
$tempRepo = Join-Path $env:TEMP "taskmaster-prod-deps-$([guid]::NewGuid().ToString('N'))"
try {
    New-Item -ItemType Directory -Path $tempRepo -Force | Out-Null
    Copy-Item (Join-Path $repoRoot 'package.json') $tempRepo
    Copy-Item (Join-Path $repoRoot 'package-lock.json') $tempRepo
    New-Item -ItemType Directory -Path (Join-Path $tempRepo 'backend') -Force | Out-Null
    Copy-Item (Join-Path $repoRoot 'backend\package.json') (Join-Path $tempRepo 'backend\package.json')
    New-Item -ItemType Directory -Path (Join-Path $tempRepo 'frontend') -Force | Out-Null
    Copy-Item (Join-Path $repoRoot 'frontend\package.json') (Join-Path $tempRepo 'frontend\package.json')

    Push-Location $tempRepo
    try {
        & npm ci --omit=dev --ignore-scripts
        if ($LASTEXITCODE -ne 0) { throw 'production npm ci failed' }
    } finally {
        Pop-Location
    }

    # robocopy, not Copy-Item: merging ~870 packages' worth of files with
    # Copy-Item -Recurse took several minutes AND turned out to silently drop
    # most of the tree the first time this was tried for real - PowerShell's
    # wildcard `'source\*' -> <destination>` copy is ambiguous when the
    # destination doesn't exist yet (confirmed: only ~107 of 873 packages
    # survived), and separately does not reliably recurse into dot-prefixed
    # directories like node_modules\.bin (confirmed: its files ended up
    # flattened loose into node_modules\ instead of nested under .bin\).
    # robocopy /E operates on the whole directory tree with normal recursive
    # semantics - no wildcard-name ambiguity for dot-prefixed folders, no
    # nonexistent-destination ambiguity - and is dramatically faster for a
    # tree this size. Its exit codes are NOT the usual 0=success: 0-7 mean
    # success (7 = files copied + extra files present), 8+ means failure.
    $appNodeModules = Join-Path $appStaging 'node_modules'
    New-Item -ItemType Directory -Path $appNodeModules -Force | Out-Null

    # Root first, then backend-specific overlay on top, so backend-specific
    # versions are not shadowed by the hoisted root copies (matches the
    # original Copy-Item ordering's intent).
    foreach ($src in @(
            (Join-Path $tempRepo 'node_modules')
            (Join-Path $tempRepo 'backend\node_modules')
        )) {
        if (Test-Path $src) {
            & robocopy.exe $src $appNodeModules /E /NFL /NDL /NJH /NJS /NP | Out-Null
            if ($LASTEXITCODE -ge 8) { throw "robocopy failed merging $src into $appNodeModules (code $LASTEXITCODE)." }
        }
    }

    # node_modules\.prisma\client (the actual GENERATED query engine/client
    # code, as opposed to the @prisma/client package itself) is produced by
    # `prisma generate`, which only runs as a postinstall hook - skipped
    # entirely by this section's own `--ignore-scripts` npm ci above. Without
    # it, the packaged app crashes at startup with "Cannot find module
    # '.prisma/client/default'" - confirmed on a real install. It was already
    # generated earlier in THIS build (step 4, "Generation du client Prisma
    # (Windows natif)"), so copy that real, already-Windows-native-generated
    # copy in rather than trying to regenerate it a second time here.
    $generatedPrismaClient = Join-Path $repoRoot 'backend\node_modules\.prisma\client'
    if (-not (Test-Path $generatedPrismaClient)) {
        throw "Generated Prisma client not found at $generatedPrismaClient - expected step 4 (db:generate) to have produced it earlier in this script."
    }
    $appDotPrisma = Join-Path $appNodeModules '.prisma\client'
    New-Item -ItemType Directory -Path $appDotPrisma -Force | Out-Null
    & robocopy.exe $generatedPrismaClient $appDotPrisma /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed copying generated Prisma client (code $LASTEXITCODE)." }

    # @prisma/engines's schema-engine-*.exe (used by `prisma migrate deploy`
    # on the target machine) is fetched by that package's OWN postinstall
    # hook - skipped by this section's `--ignore-scripts` npm ci above, same
    # root cause as the .prisma/client gap fixed right above it. Without this,
    # the packaged @prisma/engines folder exists (dependency resolution still
    # creates it) but is missing its actual binary, so `prisma migrate
    # deploy` tries to download it from the internet on the target server -
    # confirmed failing on an offline install target. The full `npm ci` in
    # step 3 (this build machine, real internet, scripts NOT skipped) already
    # downloaded the real Windows binary into the regular repo node_modules -
    # copy that real copy in exactly like the Prisma client above.
    $generatedPrismaEngines = Join-Path $repoRoot 'node_modules\@prisma\engines'
    $engineBinaries = Get-ChildItem -Path $generatedPrismaEngines -Filter '*.exe' -File -ErrorAction SilentlyContinue
    if (-not $engineBinaries) {
        throw "No Prisma engine binary (*.exe) found under $generatedPrismaEngines - expected step 3 (npm ci) to have downloaded it earlier in this script."
    }
    $appPrismaEngines = Join-Path $appNodeModules '@prisma\engines'
    New-Item -ItemType Directory -Path $appPrismaEngines -Force | Out-Null
    & robocopy.exe $generatedPrismaEngines $appPrismaEngines /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed copying Prisma engine binaries (code $LASTEXITCODE)." }

    # `pg` (used directly by installer/provision/*.js for the PostgreSQL
    # version check + existing-role/database provisioning) has come out of
    # the isolated prod-only npm ci above missing its actual code (lib/, esm/,
    # package.json - only LICENSE/README left) on at least one real build,
    # even though a from-scratch repro of the same `--omit=dev
    # --ignore-scripts` install produced a complete copy - most likely
    # antivirus real-time scanning touching files mid-robocopy on this
    # machine (see the "Clean staging" step's own comment about the same
    # class of flakiness), not a deterministic bug in the merge logic itself.
    # Rather than chase this per-package, copy the known-good, already-
    # complete `pg` from the FULL npm ci in step 3 over the isolated one,
    # exactly like the two Prisma copies above.
    $generatedPg = Join-Path $repoRoot 'node_modules\pg'
    if (-not (Test-Path (Join-Path $generatedPg 'package.json'))) {
        throw "pg package.json not found under $generatedPg - expected step 3 (npm ci) to have installed it earlier in this script."
    }
    $appPg = Join-Path $appNodeModules 'pg'
    Remove-Item $appPg -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $appPg -Force | Out-Null
    & robocopy.exe $generatedPg $appPg /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed copying pg package (code $LASTEXITCODE)." }
} finally {
    Remove-Item $tempRepo -Recurse -Force -ErrorAction SilentlyContinue
}

# ---- 8. Fetch + verify Node.js runtime and WinSW ---------------------------
Write-Stage 'Telechargement du runtime Node.js (LTS 24 x64)...'
$nodeRuntimeVersion = '24.12.0' # keep in sync with Dockerfile.windows's ARG NODE_VERSION
$nodeZipUrl = "https://nodejs.org/dist/v$nodeRuntimeVersion/node-v$nodeRuntimeVersion-win-x64.zip"
$nodeZipPath = Join-Path $env:TEMP "node-v$nodeRuntimeVersion-win-x64.zip"
$shasumsUrl = "https://nodejs.org/dist/v$nodeRuntimeVersion/SHASUMS256.txt"

Invoke-WebRequest -Uri $nodeZipUrl -OutFile $nodeZipPath
$shasums = Invoke-WebRequest -Uri $shasumsUrl -UseBasicParsing | Select-Object -ExpandProperty Content
$expectedLine = ($shasums -split "`n") | Where-Object { $_ -match "node-v$nodeRuntimeVersion-win-x64\.zip$" }
if (-not $expectedLine) { throw 'Could not find Node runtime hash in SHASUMS256.txt' }
$expectedHash = ($expectedLine -split '\s+')[0]
Assert-FileHash -Path $nodeZipPath -ExpectedSha256 $expectedHash

Expand-Archive -Path $nodeZipPath -DestinationPath (Join-Path $stagingRoot 'runtime') -Force
$extractedNodeDir = Join-Path $stagingRoot "runtime\node-v$nodeRuntimeVersion-win-x64"
if (Test-Path (Join-Path $stagingRoot 'runtime\node')) { Remove-Item (Join-Path $stagingRoot 'runtime\node') -Recurse -Force }
Rename-Item -Path $extractedNodeDir -NewName 'node'

Write-Stage 'Telechargement de WinSW (v2.12.0, Apache-2.0)...'
$winswVersion = '2.12.0'
$winswUrl = "https://github.com/winsw/winsw/releases/download/v$winswVersion/WinSW-x64.exe"
$winswExpectedSha256 = 'REPLACE_WITH_PINNED_SHA256_FOR_WINSW_v2.12.0_x64' # pin before first real build
$winswPath = Join-Path $stagingRoot 'service\taskmaster-service.exe'
Invoke-WebRequest -Uri $winswUrl -OutFile $winswPath
if ($winswExpectedSha256 -notlike 'REPLACE_WITH_*') {
    Assert-FileHash -Path $winswPath -ExpectedSha256 $winswExpectedSha256
} else {
    Write-Warning 'WinSW SHA-256 pin is a placeholder - set $winswExpectedSha256 before a real/release build.'
}
Copy-Item (Join-Path $PSScriptRoot 'service\taskmaster-service.xml') (Join-Path $stagingRoot 'service\taskmaster-service.xml')

# install-service.ps1/uninstall-service.ps1 are embedded as real MSI File
# payloads (Product.wxs's ServiceFilesGroup) rather than referenced by a
# relative path assuming a repo checkout on the target machine. They
# dot-source Taskmaster.Common.ps1 via a relative '..\common\' path, so that
# file is staged alongside them at the matching sibling location (see
# COMMONFOLDER in Product.wxs).
Copy-Item (Join-Path $PSScriptRoot 'service\install-service.ps1') (Join-Path $stagingRoot 'service\install-service.ps1') -Force
Copy-Item (Join-Path $PSScriptRoot 'service\uninstall-service.ps1') (Join-Path $stagingRoot 'service\uninstall-service.ps1') -Force
New-Item -ItemType Directory -Path (Join-Path $stagingRoot 'common') -Force | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'common\Taskmaster.Common.ps1') (Join-Path $stagingRoot 'common\Taskmaster.Common.ps1') -Force

# ---- 9. Package app/ and the embedded Node runtime as single zips --------
# A full node_modules tree is 70k+ files - harvesting one MSI Component per
# file (heat.exe's classic behavior; no WiX-v7-compatible Heat extension is
# published to fall back on either) blows past the MSI hard limit of 65536
# Components. installer/wix/AppFiles.wxs and NodeRuntimeFiles.wxs each wrap
# one of these zips in a single Component, expanded at install time by a
# deferred custom action (installer/expand-staged-archive.ps1, wired up in
# Product.wxs).
Write-Stage 'Empaquetage de app/ et du runtime Node (zip, limite MSI de 65536 composants)...'
$wixStaging = Join-Path $PSScriptRoot 'wix'
# tar.exe (bundled since Windows 10 1803 / Server 2019) rather than
# Compress-Archive - the latter takes 10+ minutes on a node_modules-sized
# tree (tens of thousands of small files); tar is a matter of seconds.
& tar.exe -a -c -f (Join-Path $stagingRoot 'app.zip') -C $appStaging .
if ($LASTEXITCODE -ne 0) { throw 'tar failed to package app.zip' }
& tar.exe -a -c -f (Join-Path $stagingRoot 'runtime\node-runtime.zip') -C (Join-Path $stagingRoot 'runtime\node') .
if ($LASTEXITCODE -ne 0) { throw 'tar failed to package node-runtime.zip' }
Copy-Item (Join-Path $PSScriptRoot 'expand-staged-archive.ps1') (Join-Path $stagingRoot 'expand-staged-archive.ps1') -Force

# ---- 10. wix build: MSI only -------------------------------------------------
# Setup.exe (WiX Burn bootstrapper, Bundle.wxs) was dropped: it added a large
# surface of its own bugs (silent PostgreSQL/Memurai download at build time,
# a separate Burn log to hunt for, its own UI quirks) for a "local PostgreSQL/
# Redis" scenario that isn't needed - every real deployment so far points at
# an already-provisioned PostgreSQL/Redis server, which is exactly what the
# MSI's own TaskmasterConfigDlg (UI.wxs) already collects. Bundle.wxs is kept
# in the repo (documents the bundled-local-provisioning design) but is no
# longer built here.
Write-Stage 'Construction du MSI...'
New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
$msiPath = Join-Path $distRoot "Taskmaster-$version-x64.msi"
& wix build (Join-Path $wixStaging 'Product.wxs') (Join-Path $wixStaging 'UI.wxs') (Join-Path $wixStaging 'AppFiles.wxs') (Join-Path $wixStaging 'NodeRuntimeFiles.wxs') `
    -arch x64 `
    -ext WixToolset.Util.wixext -ext WixToolset.UI.wixext `
    -d "ProductVersion=$version" `
    -bindpath "staging=$stagingRoot" `
    -bindpath "repo=$repoRoot" `
    -o $msiPath
if ($LASTEXITCODE -ne 0) { throw 'wix build (MSI) failed' }

# ---- 11. Checksum -------------------------------------------------------------
Write-Stage 'Calcul de la somme SHA-256...'
$sumsPath = Join-Path $distRoot 'SHA256SUMS'
@(
    (Get-FileHash -Path $msiPath -Algorithm SHA256)
) | ForEach-Object { "$($_.Hash.ToLowerInvariant())  $(Split-Path $_.Path -Leaf)" } | Set-Content $sumsPath

# ---- 12. Optional Authenticode signing --------------------------------------
if ($Sign) {
    if (-not $env:TASKMASTER_SIGN_CERT_PATH -or -not $env:TASKMASTER_SIGN_CERT_PASSWORD) {
        throw 'Sign requested but TASKMASTER_SIGN_CERT_PATH / TASKMASTER_SIGN_CERT_PASSWORD are not set.'
    }
    Write-Stage 'Signature Authenticode...'
    & signtool sign /f $env:TASKMASTER_SIGN_CERT_PATH /p $env:TASKMASTER_SIGN_CERT_PASSWORD `
        /fd sha256 /tr http://timestamp.digicert.com /td sha256 $msiPath
    if ($LASTEXITCODE -ne 0) { throw "signtool failed for $msiPath" }
    # Never echo the password; recompute checksum post-signing.
    @(
        (Get-FileHash -Path $msiPath -Algorithm SHA256)
    ) | ForEach-Object { "$($_.Hash.ToLowerInvariant())  $(Split-Path $_.Path -Leaf)" } | Set-Content $sumsPath
}

Write-Stage "Termine : $msiPath"
