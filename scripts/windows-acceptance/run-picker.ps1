$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable Windows Actions runner required' }
New-Item -ItemType Directory -Force acceptance-evidence | Out-Null
$source = Get-Content scripts/windows-acceptance/picker-source.json -Raw | ConvertFrom-Json
$candidatePath = 'acceptance-candidate/candidate.json'
if ((Get-FileHash -LiteralPath $candidatePath).Hash.ToLowerInvariant() -ne $source.candidate.manifestSha256) { throw 'Unrecognized candidate manifest' }
$candidate = Get-Content -LiteralPath $candidatePath -Raw | ConvertFrom-Json
$acceptanceKind = 'release'
$bundle = 'nsis'
$env:PHONTON_ACCEPTANCE_NATIVE_PICKER = 'true'
$env:PHONTON_ACCEPTANCE_FULL_JOURNEY = 'true'
$env:PHONTON_ACCEPTANCE_BUNDLE = $bundle
node scripts/windows-acceptance/candidate-profile.mjs $candidatePath $acceptanceKind $source.candidate.commit
if ($LASTEXITCODE -ne 0 -or $candidate.installer.sha256 -ne $source.candidate.installerSha256) { throw 'Candidate identity mismatch' }
if (Get-Process -Name phonton-desktop -ErrorAction SilentlyContinue) { throw 'Phonton must not already be running' }
$registration = & ./scripts/windows-acceptance/read-nsis-registration.ps1 | ConvertFrom-Json
if ($registration.registrations.Count -or $registration.savedDirectories.Count) { throw 'Fresh current-user installation required' }
Copy-Item -LiteralPath scripts/windows-acceptance/picker-source.json -Destination acceptance-evidence/picker-source.json
$installer = Join-Path (Resolve-Path acceptance-candidate) $candidate.installer.name
if ((Get-FileHash -LiteralPath $installer).Hash.ToLowerInvariant() -ne $candidate.installer.sha256) { throw 'Installer hash mismatch' }
$installDir = Join-Path $env:RUNNER_TEMP "Phonton $acceptanceKind acceptance"
if (Test-Path -LiteralPath $installDir) { throw 'Installation directory must be fresh' }
if (Get-NetTCPConnection -State Listen -LocalPort 47831 -ErrorAction SilentlyContinue) { throw 'Engine port already occupied' }
Copy-Item acceptance-candidate/candidate.json acceptance-evidence/candidate.json
$install = Start-Process -FilePath $installer -ArgumentList @('/S', "/D=$installDir") -PassThru -WindowStyle Hidden
if (!$install.WaitForExit(180000)) { throw 'Installer timed out' }
if ($install.ExitCode -ne 0) { throw "Installer failed: $($install.ExitCode)" }
$app = Join-Path $installDir 'phonton-desktop.exe'
$engine = Join-Path $installDir 'local-engine/phonton.exe'
$manifest = Get-Content (Join-Path $installDir 'local-engine/manifest.json') -Raw | ConvertFrom-Json
$installedDesktopHash = (Get-FileHash -LiteralPath $app).Hash.ToLowerInvariant()
$installedEngineHash = (Get-FileHash -LiteralPath $engine).Hash.ToLowerInvariant()
$registration = & ./scripts/windows-acceptance/read-nsis-registration.ps1 | ConvertFrom-Json
$registration | ConvertTo-Json -Depth 8 | Set-Content acceptance-evidence/picker-installed-registration.json
node --input-type=module -e "import {readFileSync as read} from 'node:fs'; import {validateNsisRegistration} from './scripts/windows-acceptance/nsis-upgrade-contract.mjs'; validateNsisRegistration(JSON.parse(read('acceptance-evidence/picker-installed-registration.json','utf8').replace(/^\uFEFF/,'')),process.argv[1],process.argv[2]);" $candidate.version $installDir
if ($LASTEXITCODE -ne 0) { throw 'Installed NSIS registration mismatch' }
@{ harnessCommit = $env:GITHUB_SHA; candidateCommit = $candidate.desktopCommit; installerSha256 = $candidate.installer.sha256; installed = $true; installerKind = $bundle; registration = $registration; installDirectory = $installDir; installerExitCode = $install.ExitCode; desktopSha256 = $installedDesktopHash; engineSha256 = $installedEngineHash; signature = (Get-AuthenticodeSignature $app).Status.ToString() } | ConvertTo-Json -Depth 8 | Set-Content acceptance-evidence/install.json
if ($installedDesktopHash -ne $candidate.desktopSha256) { throw 'Installed Desktop hash mismatch' }
if ($installedEngineHash -ne $candidate.engine.sha256 -or $manifest.sha256 -ne $candidate.engine.sha256 -or $manifest.profile -ne 'release' -or $manifest.version -ne $candidate.engine.version) { throw 'Installed engine mismatch' }
$env:PHONTON_ACCEPTANCE_APP = $app
$env:PHONTON_ACCEPTANCE_PROFILE = Join-Path $env:RUNNER_TEMP "phonton-$acceptanceKind-webview-profile"
$env:PHONTON_ACCEPTANCE_FIXTURE = Join-Path $env:RUNNER_TEMP 'phonton acceptance fixture'
if ((Test-Path $env:PHONTON_ACCEPTANCE_PROFILE) -or (Test-Path $env:PHONTON_ACCEPTANCE_FIXTURE)) { throw 'Test profile and fixture must be fresh' }
if ($env:PHONTON_ACCEPTANCE_FULL_JOURNEY -eq 'true') {
    if (Get-NetTCPConnection -State Listen -LocalPort 11434 -ErrorAction SilentlyContinue) { throw 'Model runtime port already occupied' }
    $stateDirectory = Join-Path $env:RUNNER_TEMP 'phonton acceptance state'
    if (Test-Path -LiteralPath $stateDirectory) { throw 'Full acceptance state must be fresh' }
    New-Item -ItemType Directory -Path $stateDirectory | Out-Null
    $env:PHONTON_LOCAL_STATE = Join-Path $stateDirectory 'local-models.json'
    $env:PHONTON_CONFIG_PATH = Join-Path $stateDirectory 'config.toml'
}
$driver = Start-Process tauri-driver -ArgumentList @('--native-driver', ('"' + $env:PHONTON_EDGE_DRIVER + '"')) -PassThru -WindowStyle Hidden -RedirectStandardOutput acceptance-evidence/tauri-driver.log -RedirectStandardError acceptance-evidence/tauri-driver-error.log
try {
    node scripts/windows-acceptance/installed-smoke.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Installed application acceptance failed; see evidence' }
} finally {
    # Test assertions complete before driver teardown: its Windows job also kills descendants.
    if (!$driver.HasExited) { Stop-Process -InputObject $driver }
}
