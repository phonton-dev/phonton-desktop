param([ValidateSet('observe', 'close')][string]$Action = 'observe')
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable Windows Actions runner required' }
$appPath = $env:PHONTON_ACCEPTANCE_APP
if (!$appPath -or !(Test-Path -LiteralPath $appPath)) { throw 'Installed application path missing' }
$enginePath = Join-Path (Split-Path $appPath) 'local-engine/phonton.exe'
$apps = @(Get-CimInstance Win32_Process -Filter "Name='phonton-desktop.exe'" | Where-Object ExecutablePath -EQ $appPath)
$engines = @(Get-CimInstance Win32_Process -Filter "Name='phonton.exe'" | Where-Object ExecutablePath -EQ $enginePath)
if ($Action -eq 'close') {
    if ($apps.Count -ne 1) { throw 'Expected exactly one installed Preview process' }
    $appProcess = Get-Process -Id $apps[0].ProcessId
    if ($appProcess.Path -ne $appPath -or !$appProcess.CloseMainWindow()) { throw 'Normal window-close request failed' }
} else {
    $listeners = @(Get-NetTCPConnection -State Listen -LocalPort 47831 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess)
    @{ apps = @($apps | Select-Object ProcessId,ParentProcessId,ExecutablePath); engines = @($engines | Select-Object ProcessId,ParentProcessId,ExecutablePath); listeners = $listeners } | ConvertTo-Json -Depth 5 -Compress
}
