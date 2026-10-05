$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable Windows Actions runner required' }
if ($env:PHONTON_ACCEPTANCE_PROFILE -or $env:WEBVIEW2_USER_DATA_FOLDER) { throw 'Default WebView profile must not be overridden' }
$env:PHONTON_ACCEPTANCE_UPGRADE_NATIVE = 'true'
New-Item -ItemType Directory -Force acceptance-evidence | Out-Null
$source = Get-Content scripts/windows-acceptance/nsis-upgrade-source.json -Raw | ConvertFrom-Json
$candidatePath = 'acceptance-candidate/candidate.json'
if ((Get-FileHash -LiteralPath $candidatePath).Hash.ToLowerInvariant() -ne $source.candidate.manifestSha256) { throw 'Unrecognized candidate manifest' }
$candidate = Get-Content -LiteralPath $candidatePath -Raw | ConvertFrom-Json
$oldInstaller = Join-Path (Resolve-Path upgrade-baseline) $source.baseline.name
$newInstaller = Join-Path (Resolve-Path acceptance-candidate) $candidate.installer.name
if ((Get-FileHash -LiteralPath $oldInstaller).Hash.ToLowerInvariant() -ne $source.baseline.sha256) { throw 'Stable NSIS digest mismatch' }
if ((Get-FileHash -LiteralPath $newInstaller).Hash.ToLowerInvariant() -ne $source.candidate.installerSha256) { throw 'Candidate NSIS digest mismatch' }
node --input-type=module -e "import {readFileSync as read} from 'node:fs'; import {validateNsisUpgrade} from './scripts/windows-acceptance/nsis-upgrade-contract.mjs'; const json=p=>JSON.parse(read(p,'utf8').replace(/^\uFEFF/,'')); validateNsisUpgrade(json('scripts/windows-acceptance/nsis-upgrade-source.json'),json('acceptance-candidate/candidate.json'));"
if ($LASTEXITCODE -ne 0) { throw 'NSIS upgrade identity contract failed' }
$installDir = Join-Path $env:RUNNER_TEMP 'Phonton NSIS upgrade acceptance'
$fixture = Join-Path $env:RUNNER_TEMP 'phonton acceptance fixture'
$stateDirectory = Join-Path $env:RUNNER_TEMP 'phonton upgrade state'
foreach ($location in @($installDir, $fixture, $stateDirectory, (Join-Path $env:LOCALAPPDATA 'dev.phonton.desktop'), (Join-Path $env:APPDATA 'dev.phonton.desktop'))) {
    if (Test-Path -LiteralPath $location) { throw "Upgrade fixture must start fresh: $location" }
}
foreach ($port in @(47831, 11434)) {
    if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) { throw "Port $port already occupied" }
}
function ObserveRegistration([string]$Label, [string]$Version) {
    $file = "acceptance-evidence/upgrade-$Label-registration.json"
    & ./scripts/windows-acceptance/read-nsis-registration.ps1 | Set-Content -LiteralPath $file
    if ($Version) {
        node --input-type=module -e "import {readFileSync as read} from 'node:fs'; import {validateNsisRegistration} from './scripts/windows-acceptance/nsis-upgrade-contract.mjs'; validateNsisRegistration(JSON.parse(read(process.argv[1],'utf8').replace(/^\uFEFF/,'')),process.argv[2],process.argv[3]);" $file $Version $installDir
        if ($LASTEXITCODE -ne 0) { throw "NSIS $Label registration contract failed" }
    } else {
        $before = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
        if ($before.registrations.Count -ne 0 -or $before.savedDirectories.Count -ne 0) { throw 'Existing Phonton registration or install directory preference' }
    }
}
function InstallNsis([string]$Installer, [string]$Label, [bool]$SetDirectory) {
    # The silent NSIS installer can terminate matching apps. Refuse any live app.
    if (Get-Process -Name phonton-desktop -ErrorAction SilentlyContinue) { throw 'Phonton must be closed before running the installer' }
    $arguments = @('/S')
    if ($SetDirectory) { $arguments += "/D=$installDir" } # Last, unquoted, including spaces.
    $process = Start-Process -FilePath $Installer -ArgumentList $arguments -PassThru -WindowStyle Hidden
    if (!$process.WaitForExit(180000)) { throw 'NSIS installation timed out' }
    @{ schema = 1; installerSha256 = (Get-FileHash -LiteralPath $Installer).Hash.ToLowerInvariant(); arguments = $arguments; exitCode = $process.ExitCode } | ConvertTo-Json -Depth 4 | Set-Content "acceptance-evidence/upgrade-$Label-install.json"
    if ($process.ExitCode -ne 0) { throw "NSIS installation failed: $($process.ExitCode)" }
}
ObserveRegistration 'before' ''
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
Copy-Item -LiteralPath scripts/windows-acceptance/nsis-upgrade-source.json -Destination acceptance-evidence/upgrade-source.json
InstallNsis $oldInstaller 'stable' $true
ObserveRegistration 'stable' $source.baseline.version
$env:PHONTON_ACCEPTANCE_APP = Join-Path $installDir 'phonton-desktop.exe'
$env:PHONTON_ACCEPTANCE_FIXTURE = $fixture
$env:PHONTON_ACCEPTANCE_FULL_JOURNEY = 'false'
RunNative 'scripts/windows-acceptance/stable-upgrade-seed.mjs' 'upgrade-stable'
$seed = Get-Content acceptance-evidence/upgrade-seed.json -Raw | ConvertFrom-Json
if ($seed.status -ne 'stable-closed') { throw 'Stable app did not finish normal close' }

# No explicit uninstall, profile clearing or fixture reseed. Omit /D on upgrade
# so the installer must discover the existing custom location itself.
InstallNsis $newInstaller 'candidate' $false
ObserveRegistration 'candidate' $candidate.version
$desktopHash = (Get-FileHash -LiteralPath $env:PHONTON_ACCEPTANCE_APP).Hash.ToLowerInvariant()
$engineHash = (Get-FileHash -LiteralPath (Join-Path $installDir 'local-engine/phonton.exe')).Hash.ToLowerInvariant()
$engineManifest = Get-Content -LiteralPath (Join-Path $installDir 'local-engine/manifest.json') -Raw | ConvertFrom-Json
if ($desktopHash -ne $candidate.desktopSha256 -or $engineHash -ne $candidate.engine.sha256 -or $engineManifest.sha256 -ne $engineHash -or $engineManifest.profile -ne 'release' -or $engineManifest.version -ne $candidate.engine.version) { throw 'Upgraded app or engine bytes differ from candidate' }
@{ schema = 1; status = 'installed'; harnessCommit = $env:GITHUB_SHA; candidateCommit = $candidate.desktopCommit; installerKind = 'nsis'; baseline = $source.baseline; installerSha256 = $candidate.installer.sha256; registrationKey = 'HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Phonton'; displayVersion = $candidate.version; installDirectoryDiscovered = $true; desktopSha256 = $desktopHash; engineSha256 = $engineHash; signature = (Get-AuthenticodeSignature -LiteralPath $env:PHONTON_ACCEPTANCE_APP).Status.ToString(); profile = 'default-webview'; installDirectory = $installDir; installerExitCode = 0 } | ConvertTo-Json -Depth 6 | Set-Content acceptance-evidence/upgrade-install.json
New-Item -ItemType Directory -Path $stateDirectory | Out-Null
$env:PHONTON_LOCAL_STATE = Join-Path $stateDirectory 'local-models.json'
$env:PHONTON_CONFIG_PATH = Join-Path $stateDirectory 'config.toml'
$env:PHONTON_ACCEPTANCE_FULL_JOURNEY = 'true'
$env:PHONTON_ACCEPTANCE_UPGRADE_RECORD = (Resolve-Path acceptance-evidence/upgrade-seed.json).Path
RunNative 'scripts/windows-acceptance/installed-smoke.mjs' 'upgrade-candidate'
