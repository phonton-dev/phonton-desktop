param([Parameter(Mandatory)][string]$RecordPath)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable Windows Actions runner required' }
if ($env:WEBVIEW2_USER_DATA_FOLDER -or $env:PHONTON_ACCEPTANCE_PROFILE) { throw 'Default profile must not be overridden' }
$app = $env:PHONTON_ACCEPTANCE_APP
if (!$app -or !(Test-Path -LiteralPath $app)) { throw 'Installed application missing' }
if (Get-CimInstance Win32_Process -Filter "Name='phonton-desktop.exe'" | Where-Object ExecutablePath -EQ $app) { throw 'Installed application already running' }
if (Get-NetTCPConnection -State Listen -LocalPort 9222 -ErrorAction SilentlyContinue) { throw 'Test debug port is occupied' }
# Scoped to this cloud-only child process; no machine/user environment mutation.
# The app selects its own normal data directory. EdgeDriver only attaches later.
$start = [System.Diagnostics.ProcessStartInfo]::new()
$start.FileName = $app
$start.UseShellExecute = $false
$start.Environment['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = '--remote-debugging-port=9222 --remote-debugging-address=127.0.0.1'
$start.Environment['TAURI_WEBVIEW_AUTOMATION'] = 'true'
$process = [System.Diagnostics.Process]::Start($start)
@{ processId = $process.Id; app = $app; profileOverride = $false } | ConvertTo-Json -Compress | Set-Content -LiteralPath $RecordPath
