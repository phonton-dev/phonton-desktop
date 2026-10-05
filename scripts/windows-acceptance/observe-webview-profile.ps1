$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable Windows Actions runner required' }
$processes = @(Get-CimInstance Win32_Process)
$apps = @($processes | Where-Object { $_.Name -eq 'phonton-desktop.exe' -and $_.ExecutablePath -eq $env:PHONTON_ACCEPTANCE_APP })
if ($apps.Count -ne 1) { throw 'Expected one installed app for profile observation' }
$owned = [System.Collections.Generic.HashSet[uint32]]::new()
$null = $owned.Add([uint32]$apps[0].ProcessId)
do {
    $added = $false
    foreach ($process in $processes) {
        if ($owned.Contains([uint32]$process.ParentProcessId) -and $owned.Add([uint32]$process.ProcessId)) { $added = $true }
    }
} while ($added)
$profiles = @($processes | Where-Object { $_.Name -eq 'msedgewebview2.exe' -and $owned.Contains([uint32]$_.ProcessId) } | ForEach-Object {
    $match = [regex]::Match($_.CommandLine, '--user-data-dir=(?:"([^"]+)"|([^\s]+))')
    if ($match.Success) { if ($match.Groups[1].Success) { $match.Groups[1].Value } else { $match.Groups[2].Value } }
} | Sort-Object -Unique)
$webviewIds = @($processes | Where-Object { $_.Name -eq 'msedgewebview2.exe' -and $owned.Contains([uint32]$_.ProcessId) } | ForEach-Object { [uint32]$_.ProcessId })
$debugListeners = @(Get-NetTCPConnection -State Listen -LocalPort 9222 -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,OwningProcess)
@{ appProcessId = $apps[0].ProcessId; userDataDirectories = $profiles; ownedWebViewProcessIds = $webviewIds; debugListeners = $debugListeners } | ConvertTo-Json -Depth 4 -Compress
