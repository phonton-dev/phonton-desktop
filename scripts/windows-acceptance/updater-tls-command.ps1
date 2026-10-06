param([Parameter(Mandatory)][ValidateSet('create', 'cleanup')][string]$Action)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or
    $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:GITHUB_EVENT_NAME -ne 'workflow_dispatch' -or
    $env:GITHUB_REPOSITORY -ne 'phonton-dev/phonton-desktop') { throw 'Manual disposable Windows Actions runner required' }
$invocations = 'acceptance-evidence/updater-tls-invocations.jsonl'
if (Test-Path -LiteralPath $invocations) {
    foreach ($line in Get-Content -LiteralPath $invocations) {
        $prior = $line | ConvertFrom-Json
        if ($prior.phase -ne 'started') { continue }
        if ($prior.runId -ne $env:GITHUB_RUN_ID -or $prior.runAttempt -ne $env:GITHUB_RUN_ATTEMPT) { throw 'TLS helper evidence belongs to another run' }
        $observed = Get-Process -Id $prior.helperPid -ErrorAction SilentlyContinue
        if ($null -ne $observed -and $observed.StartTime.ToUniversalTime().Ticks.ToString() -eq $prior.startTicks) {
            throw 'Prior TLS helper is still alive; refuse concurrent trust creation or cleanup'
        }
    }
}
$invocationId = [Guid]::NewGuid().ToString('N')
$evidencePrefix = "acceptance-evidence/updater-tls-$Action-$invocationId"
$helper = Start-Process -FilePath (Get-Command pwsh -ErrorAction Stop).Source -ArgumentList @(
    '-NoProfile', '-NonInteractive', '-File', 'scripts/windows-acceptance/updater-tls.ps1', '-Action', $Action
) -PassThru -WindowStyle Hidden -RedirectStandardOutput "$evidencePrefix.log" -RedirectStandardError "$evidencePrefix-error.log"
$invocation = [ordered]@{ schema=1; invocationId=$invocationId; action=$Action; phase='started'; helperPid=$helper.Id;
    startTicks=$helper.StartTime.ToUniversalTime().Ticks.ToString(); runId=$env:GITHUB_RUN_ID; runAttempt=$env:GITHUB_RUN_ATTEMPT;
    stdout="$evidencePrefix.log"; stderr="$evidencePrefix-error.log" }
$invocation | ConvertTo-Json -Compress | Add-Content -LiteralPath $invocations -Encoding utf8
if (!$helper.WaitForExit(90000)) {
    # Only this newly created helper handle; never a name/PID-wide process search.
    Stop-Process -InputObject $helper -ErrorAction Stop
    $exited = $helper.WaitForExit(10000)
    @{ schema=1; invocationId=$invocationId; action=$Action; helperPid=$helper.Id; timedOut=$true; timeoutSeconds=90; helperExited=$exited } |
        ConvertTo-Json | Set-Content -LiteralPath "$evidencePrefix-timeout.json" -Encoding utf8
    $invocation.phase = 'timed-out'
    $invocation | ConvertTo-Json -Compress | Add-Content -LiteralPath $invocations -Encoding utf8
    if (!$exited) { throw 'Timed-out TLS helper did not exit; later cleanup refuses to race its recorded process lifetime' }
    throw "TLS $Action exceeded its 90-second bound; helper exited and exact-identity cleanup can proceed"
}
$invocation.phase = 'exited'
$invocation | ConvertTo-Json -Compress | Add-Content -LiteralPath $invocations -Encoding utf8
if ($helper.ExitCode -ne 0) { throw "TLS $Action failed with exit $($helper.ExitCode); see retained stage and helper logs" }
