$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or
    $env:GITHUB_EVENT_NAME -ne 'workflow_dispatch' -or $env:GITHUB_REPOSITORY -ne 'phonton-dev/phonton-desktop') { throw 'Manual disposable Windows Actions runner required' }
if ($env:WEBVIEW2_USER_DATA_FOLDER -or $env:PHONTON_ACCEPTANCE_PROFILE) { throw 'Default profile must not be overridden' }
node scripts/windows-acceptance/package-updater-bootstrap.mjs
if ($LASTEXITCODE -ne 0) { throw 'Updater artifact identity rejected' }
$bootstrap = Get-Content acceptance-evidence/updater-bootstrap.json -Raw | ConvertFrom-Json
$candidate = Get-Content acceptance-candidate/candidate.json -Raw | ConvertFrom-Json
$installDirectory = Join-Path $env:RUNNER_TEMP 'Phonton controlled updater acceptance'
$stateDirectory = Join-Path $env:RUNNER_TEMP 'phonton controlled updater state'
$env:PHONTON_ACCEPTANCE_FIXTURE = Join-Path $env:RUNNER_TEMP 'phonton acceptance fixture'
foreach ($location in @($installDirectory, $stateDirectory, $env:PHONTON_ACCEPTANCE_FIXTURE,
    (Join-Path $env:LOCALAPPDATA 'dev.phonton.desktop'), (Join-Path $env:APPDATA 'dev.phonton.desktop'))) {
    if (Test-Path -LiteralPath $location) { throw "Updater acceptance must start fresh: $location" }
}
foreach ($port in @(47831, 11434, 9222, 39461, 4444, 4445, 4446, 4447)) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw "Port $port is occupied" }
}
$registration = & ./scripts/windows-acceptance/read-nsis-registration.ps1 | ConvertFrom-Json
if ($registration.registrations.Count -ne 0 -or $registration.savedDirectories.Count -ne 0) { throw 'Existing Phonton registration' }
if (Get-Process -Name phonton-desktop -ErrorAction SilentlyContinue) { throw 'Do not run NSIS with another Phonton app present' }
$installer = Start-Process -FilePath $bootstrap.installer.path -ArgumentList @('/S', "/D=$installDirectory") -PassThru -WindowStyle Hidden
if (!$installer.WaitForExit(180000) -or $installer.ExitCode -ne 0) { throw 'Bootstrap NSIS installation failed' }
$env:PHONTON_ACCEPTANCE_APP = Join-Path $installDirectory 'phonton-desktop.exe'
if ((Get-FileHash -LiteralPath $env:PHONTON_ACCEPTANCE_APP).Hash.ToLowerInvariant() -ne $bootstrap.desktopSha256) { throw 'Installed bootstrap bytes differ' }
if ((Get-FileHash -LiteralPath (Join-Path $installDirectory 'local-engine/phonton.exe')).Hash.ToLowerInvariant() -ne $bootstrap.engine.sha256) { throw 'Installed bootstrap engine differs' }
Copy-Item -LiteralPath acceptance-candidate/candidate.json -Destination acceptance-evidence/candidate.json
New-Item -ItemType Directory -Path $stateDirectory | Out-Null
# These must be inherited by the first bootstrap, its installer and automatic restart.
$env:PHONTON_LOCAL_STATE = Join-Path $stateDirectory 'local-models.json'
$env:PHONTON_CONFIG_PATH = Join-Path $stateDirectory 'config.toml'
$env:PHONTON_ACCEPTANCE_UPGRADE_NATIVE = 'true'
$env:PHONTON_ACCEPTANCE_CONTROLLED_UPDATER = 'true'
$env:PHONTON_ACCEPTANCE_FULL_JOURNEY = 'true'
& ./scripts/windows-acceptance/updater-tls-command.ps1 -Action create
$driver = $null
$replacementDriver = $null
try {
    $driver = Start-Process tauri-driver -ArgumentList @('--native-driver', ('"' + $env:PHONTON_EDGE_DRIVER + '"')) -PassThru -WindowStyle Hidden -RedirectStandardOutput acceptance-evidence/updater-driver.log -RedirectStandardError acceptance-evidence/updater-driver-error.log
    $replacementDriver = Start-Process tauri-driver -ArgumentList @('--port', '4446', '--native-port', '4447', '--native-driver', ('"' + $env:PHONTON_EDGE_DRIVER + '"')) -PassThru -WindowStyle Hidden -RedirectStandardOutput acceptance-evidence/updater-replacement-driver.log -RedirectStandardError acceptance-evidence/updater-replacement-driver-error.log
    node scripts/windows-acceptance/updater-journey.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Native updater acceptance failed; retain the actual failure' }
    $record = Get-Content acceptance-evidence/updater-seed.json -Raw | ConvertFrom-Json
    if ($record.status -ne 'candidate-closed') { throw 'Updated candidate did not complete its independent restart and close checks' }
    $env:PHONTON_ACCEPTANCE_UPDATER_RECORD = (Resolve-Path acceptance-evidence/updater-seed.json).Path
    node scripts/windows-acceptance/installed-smoke.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Full post-update journey failed' }
} finally {
    if (Get-CimInstance Win32_Process -Filter "Name='phonton-desktop.exe'" | Where-Object ExecutablePath -EQ $env:PHONTON_ACCEPTANCE_APP) {
        try { & ./scripts/windows-acceptance/native-process.ps1 -Action close } catch { Write-Warning 'Normal test-app cleanup failed; disposable runner teardown will clean it up' }
    }
    if ($null -ne $driver -and !$driver.HasExited) { Stop-Process -InputObject $driver }
    if ($null -ne $replacementDriver -and !$replacementDriver.HasExited) { Stop-Process -InputObject $replacementDriver }
    & ./scripts/windows-acceptance/updater-tls-command.ps1 -Action cleanup
}
