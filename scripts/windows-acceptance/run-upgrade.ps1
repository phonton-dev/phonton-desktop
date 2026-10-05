$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable Windows Actions runner required' }
if ($env:PHONTON_ACCEPTANCE_PROFILE -or $env:WEBVIEW2_USER_DATA_FOLDER) { throw 'Default WebView profile must not be overridden' }
$env:PHONTON_ACCEPTANCE_UPGRADE_NATIVE = 'true'
New-Item -ItemType Directory -Force acceptance-evidence | Out-Null
$source = Get-Content scripts/windows-acceptance/upgrade-source.json -Raw | ConvertFrom-Json
$candidatePath = 'acceptance-candidate/candidate.json'
if ((Get-FileHash -LiteralPath $candidatePath).Hash.ToLowerInvariant() -ne $source.candidate.manifestSha256) { throw 'Unrecognized candidate manifest' }
$candidate = Get-Content -LiteralPath $candidatePath -Raw | ConvertFrom-Json
$oldInstaller = Join-Path (Resolve-Path upgrade-baseline) $source.baseline.name
$newInstaller = Join-Path (Resolve-Path acceptance-candidate) $candidate.installer.name
if ((Get-FileHash -LiteralPath $oldInstaller).Hash.ToLowerInvariant() -ne $source.baseline.sha256) { throw 'Stable MSI digest mismatch' }
if ((Get-FileHash -LiteralPath $newInstaller).Hash.ToLowerInvariant() -ne $source.candidate.installerSha256) { throw 'Candidate MSI digest mismatch' }
$oldMetadata = & ./scripts/windows-acceptance/read-msi-metadata.ps1 -InstallerPath $oldInstaller | ConvertFrom-Json
$newMetadata = & ./scripts/windows-acceptance/read-msi-metadata.ps1 -InstallerPath $newInstaller | ConvertFrom-Json
$oldMetadata | ConvertTo-Json -Depth 8 | Set-Content acceptance-evidence/upgrade-stable-msi.json
$newMetadata | ConvertTo-Json -Depth 8 | Set-Content acceptance-evidence/upgrade-candidate-msi.json
node --input-type=module -e "import {readFileSync as read} from 'node:fs'; import {validateUpgrade} from './scripts/windows-acceptance/upgrade-contract.mjs'; const json=p=>JSON.parse(read(p,'utf8').replace(/^\uFEFF/,'')); validateUpgrade(json('scripts/windows-acceptance/upgrade-source.json'),json('acceptance-candidate/candidate.json'),json('acceptance-evidence/upgrade-stable-msi.json').properties,json('acceptance-evidence/upgrade-candidate-msi.json').properties);"
if ($LASTEXITCODE -ne 0) { throw 'MSI upgrade identity contract failed' }
$installDir = Join-Path $env:RUNNER_TEMP 'Phonton MSI upgrade acceptance'
$fixture = Join-Path $env:RUNNER_TEMP 'phonton acceptance fixture'
$stateDirectory = Join-Path $env:RUNNER_TEMP 'phonton upgrade state'
foreach ($location in @($installDir, $fixture, $stateDirectory, (Join-Path $env:LOCALAPPDATA 'dev.phonton.desktop'), (Join-Path $env:APPDATA 'dev.phonton.desktop'))) {
    if (Test-Path -LiteralPath $location) { throw "Upgrade fixture must start fresh: $location" }
}
foreach ($port in @(47831, 11434)) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw "Port $port already occupied" }
}
function RegistrationPath([string]$Code) { "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$Code" }
$oldRegistration = RegistrationPath $oldMetadata.properties.ProductCode
$newRegistration = RegistrationPath $candidate.msi.ProductCode
if ((Test-Path -LiteralPath $oldRegistration) -or (Test-Path -LiteralPath $newRegistration)) { throw 'Existing MSI product registration' }
function InstallMsi([string]$Installer, [string]$LogName) {
    $log = Join-Path (Resolve-Path acceptance-evidence) $LogName
    $process = Start-Process -FilePath (Join-Path $env:WINDIR 'System32/msiexec.exe') -ArgumentList @('/i', ('"' + $Installer + '"'), '/qn', '/norestart', ('INSTALLDIR="' + $installDir + '"'), '/L*V', ('"' + $log + '"')) -PassThru -WindowStyle Hidden
    if (!$process.WaitForExit(180000)) { throw 'MSI installation timed out' }
    if ($process.ExitCode -ne 0) { throw "MSI installation failed: $($process.ExitCode)" }
}
function RunNative([string]$Script, [string]$Label) {
    $driver = Start-Process tauri-driver -ArgumentList @('--native-driver', ('"' + $env:PHONTON_EDGE_DRIVER + '"')) -PassThru -WindowStyle Hidden -RedirectStandardOutput "acceptance-evidence/$Label-driver.log" -RedirectStandardError "acceptance-evidence/$Label-driver-error.log"
    try {
        node $Script
        if ($LASTEXITCODE -ne 0) { throw "$Label native acceptance failed" }
    } finally {
        # Attach mode owns the app separately from the driver. On failure request
        # its normal close by exact installed path; never terminate unrelated apps.
        if (Get-CimInstance Win32_Process -Filter "Name='phonton-desktop.exe'" | Where-Object ExecutablePath -EQ $env:PHONTON_ACCEPTANCE_APP) {
            try { & ./scripts/windows-acceptance/native-process.ps1 -Action close } catch { Write-Warning 'Could not normally close the failed test app; disposable runner teardown will clean it up' }
        }
        if (!$driver.HasExited) { Stop-Process -InputObject $driver }
    }
}
Copy-Item -LiteralPath $candidatePath -Destination acceptance-evidence/candidate.json
Copy-Item -LiteralPath scripts/windows-acceptance/upgrade-source.json -Destination acceptance-evidence/upgrade-source.json
InstallMsi $oldInstaller 'upgrade-stable-install.log'
$registeredOld = Get-ItemProperty -LiteralPath $oldRegistration
if ($registeredOld.DisplayName -ne 'Phonton' -or $registeredOld.DisplayVersion -ne $source.baseline.version) { throw 'Stable MSI registration mismatch' }
$env:PHONTON_ACCEPTANCE_APP = Join-Path $installDir 'phonton-desktop.exe'
$env:PHONTON_ACCEPTANCE_FIXTURE = $fixture
$env:PHONTON_ACCEPTANCE_FULL_JOURNEY = 'false'
RunNative 'scripts/windows-acceptance/stable-upgrade-seed.mjs' 'upgrade-stable'
$seed = Get-Content acceptance-evidence/upgrade-seed.json -Raw | ConvertFrom-Json
if ($seed.status -ne 'stable-closed') { throw 'Stable app did not finish normal close' }

# No uninstall, profile clearing or fixture reseed between these installations.
InstallMsi $newInstaller 'upgrade-candidate-install.log'
if (Test-Path -LiteralPath $oldRegistration) { throw 'Old MSI product still registered after upgrade' }
$registeredNew = Get-ItemProperty -LiteralPath $newRegistration
if ($registeredNew.DisplayName -ne $candidate.msi.ProductName -or $registeredNew.DisplayVersion -ne $candidate.msi.ProductVersion) { throw 'Upgraded registration identity mismatch' }
$desktopHash = (Get-FileHash -LiteralPath $env:PHONTON_ACCEPTANCE_APP).Hash.ToLowerInvariant()
$engineHash = (Get-FileHash -LiteralPath (Join-Path $installDir 'local-engine/phonton.exe')).Hash.ToLowerInvariant()
$engineManifest = Get-Content -LiteralPath (Join-Path $installDir 'local-engine/manifest.json') -Raw | ConvertFrom-Json
if ($desktopHash -ne $candidate.desktopSha256 -or $engineHash -ne $candidate.engine.sha256 -or $engineManifest.sha256 -ne $engineHash -or $engineManifest.profile -ne 'release' -or $engineManifest.version -ne $candidate.engine.version) { throw 'Upgraded app or engine bytes differ from candidate' }
@{ schema = 1; status = 'installed'; harnessCommit = $env:GITHUB_SHA; candidateCommit = $candidate.desktopCommit; installerKind = 'msi'; baseline = $source.baseline; installerSha256 = $candidate.installer.sha256; stableRegistrationRemoved = $true; stableProductCode = $oldMetadata.properties.ProductCode; candidateProductCode = $candidate.msi.ProductCode; upgradeCode = $candidate.msi.UpgradeCode; displayVersion = $registeredNew.DisplayVersion; desktopSha256 = $desktopHash; engineSha256 = $engineHash; signature = (Get-AuthenticodeSignature -LiteralPath $env:PHONTON_ACCEPTANCE_APP).Status.ToString(); profile = 'default-webview'; installDirectory = $installDir; installerExitCode = 0 } | ConvertTo-Json -Depth 6 | Set-Content acceptance-evidence/upgrade-install.json
New-Item -ItemType Directory -Path $stateDirectory | Out-Null
$env:PHONTON_LOCAL_STATE = Join-Path $stateDirectory 'local-models.json'
$env:PHONTON_CONFIG_PATH = Join-Path $stateDirectory 'config.toml'
$env:PHONTON_ACCEPTANCE_FULL_JOURNEY = 'true'
$env:PHONTON_ACCEPTANCE_UPGRADE_RECORD = (Resolve-Path acceptance-evidence/upgrade-seed.json).Path
RunNative 'scripts/windows-acceptance/installed-smoke.mjs' 'upgrade-candidate'
