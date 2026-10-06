param([Parameter(Mandatory)][ValidateSet('create','cleanup')][string]$Action)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or
    $env:GITHUB_EVENT_NAME -ne 'workflow_dispatch' -or $env:GITHUB_REPOSITORY -ne 'phonton-dev/phonton-desktop') { throw 'Manual disposable Windows Actions runner required' }
if ($env:GITHUB_RUN_ID -notmatch '^\d+$' -or $env:GITHUB_RUN_ATTEMPT -notmatch '^\d+$') { throw 'Exact cloud run required' }
if ($env:WEBVIEW2_USER_DATA_FOLDER -or $env:PHONTON_ACCEPTANCE_PROFILE) { throw 'Default profile must not be overridden' }
. "$PSScriptRoot/owned-test-values.ps1"
$recordPath = Join-Path $PWD 'acceptance-evidence/updater-user-environment.json'
if (!$env:RUNNER_TEMP -or ![IO.Path]::IsPathFullyQualified($env:RUNNER_TEMP)) { throw 'Absolute cloud temporary directory required' }
$temporary = [IO.Path]::GetFullPath($env:RUNNER_TEMP).TrimEnd('\')
$stateDirectory = Join-Path $temporary 'phonton controlled updater state'
$values = [ordered]@{
    PHONTON_CONFIG_PATH = (Join-Path $stateDirectory 'config.toml')
    PHONTON_LOCAL_STATE = (Join-Path $stateDirectory 'local-models.json')
    'WebView2:phonton-desktop.exe' = '--remote-debugging-port=9222 --remote-debugging-address=127.0.0.1'
}
$policyPath = 'Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments'
$read = {
    param($name)
    if ($name -eq 'WebView2:phonton-desktop.exe') {
        $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($policyPath, $false)
        if ($null -eq $key) { return $null }
        try { return $key.GetValue('phonton-desktop.exe', $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) }
        finally { $key.Dispose() }
    }
    return [Environment]::GetEnvironmentVariable($name, 'User')
}
$write = {
    param($name, $value)
    if ($name -eq 'WebView2:phonton-desktop.exe') {
        $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($policyPath)
        try {
            if ($null -eq $value) { $key.DeleteValue('phonton-desktop.exe', $false) }
            else { $key.SetValue('phonton-desktop.exe', $value, [Microsoft.Win32.RegistryValueKind]::String) }
        } finally { $key.Dispose() }
    } elseif ($null -eq $value) {
        # PowerShell marshals ordinary $null to an empty .NET string. On .NET 9+
        # that preserves an empty value; only a CLR null removes the owned value.
        [Environment]::SetEnvironmentVariable($name, [System.Management.Automation.Language.NullString]::Value, 'User')
    } else { [Environment]::SetEnvironmentVariable($name, $value, 'User') }
}
$save = {
    param($phase)
    $snapshot = @{ schema=1; runId=$env:GITHUB_RUN_ID; runAttempt=$env:GITHUB_RUN_ATTEMPT; phase=$phase;
       values=$values; profileOverride=$false; policyScope='CurrentUser/phonton-desktop.exe';
       scope='Disposable runner only; no machine values, wildcard policy, credentials or app bytes changed' } |
        ConvertTo-Json -Depth 5
    $snapshot | Set-Content -LiteralPath $recordPath
    # Preserve setup and both cleanup observations even after the ownership record advances.
    $stage = Join-Path (Split-Path $recordPath) ("updater-user-environment-$phase-" + [Guid]::NewGuid().ToString('N') + '.json')
    $snapshot | Set-Content -LiteralPath $stage
}
if ($Action -eq 'create') {
    if (Test-Path -LiteralPath $recordPath) { throw 'Environment ownership record already exists' }
    if ($env:PHONTON_CONFIG_PATH -cne $values.PHONTON_CONFIG_PATH -or $env:PHONTON_LOCAL_STATE -cne $values.PHONTON_LOCAL_STATE) { throw 'Unexpected process fixture paths' }
    if (Get-Process -Name phonton-desktop -ErrorAction SilentlyContinue) { throw 'Prepare test environment before native launch' }
    foreach ($name in @('PHONTON_CONFIG_PATH','PHONTON_LOCAL_STATE')) {
        if ($null -ne [Environment]::GetEnvironmentVariable($name, 'Machine')) { throw "Existing machine value: $name" }
    }
    # Refuse policies that could override the exact per-executable test setting.
    foreach ($hive in @([Microsoft.Win32.RegistryHive]::LocalMachine, [Microsoft.Win32.RegistryHive]::CurrentUser)) {
        foreach ($view in @([Microsoft.Win32.RegistryView]::Registry64, [Microsoft.Win32.RegistryView]::Registry32)) {
            $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey($hive, $view)
            try {
                $key = $base.OpenSubKey($policyPath, $false)
                if ($null -ne $key) {
                    try { foreach ($name in @('phonton-desktop.exe','dev.phonton.desktop','*')) { if ($null -ne $key.GetValue($name, $null)) { throw "Existing WebView policy must be preserved: $hive/$view/$name" } } }
                    finally { $key.Dispose() }
                }
            } finally { $base.Dispose() }
        }
    }
    Set-OwnedTestValues $values $read $write $save
} else {
    if (!(Test-Path -LiteralPath $recordPath)) { return }
    $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json -AsHashtable
    if ($record.schema -ne 1 -or $record.runId -cne $env:GITHUB_RUN_ID -or $record.runAttempt -cne $env:GITHUB_RUN_ATTEMPT -or
        $record.phase -notin @('prepared','created','removed') -or $record.profileOverride -ne $false -or
        $record.policyScope -cne 'CurrentUser/phonton-desktop.exe' -or $record.values.Count -ne $values.Count) { throw 'Foreign or invalid ownership record' }
    foreach ($name in $values.Keys) { if ($record.values[$name] -cne $values[$name]) { throw 'Ownership payload changed' } }
    Remove-OwnedTestValues $values $read $write $save
}
