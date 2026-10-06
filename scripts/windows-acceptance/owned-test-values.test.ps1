$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/owned-test-values.ps1"
function Assert-True($value, $message) { if (!$value) { throw $message } }
function Reject($action, $pattern) {
    $failure = $null
    try { & $action } catch { $failure = $_.Exception.Message }
    Assert-True ($null -ne $failure -and $failure -match $pattern) "Expected rejection: $pattern; received: $failure"
}
$desired = [ordered]@{ config='fixture-config'; state='fixture-state'; debug='loopback' }
$store = @{}; $events = [Collections.Generic.List[string]]::new(); $phases = [Collections.Generic.List[string]]::new()
$read = { param($name) if ($store.ContainsKey($name)) { return $store[$name] }; return $null }
$write = { param($name,$value) $events.Add($name); if ($null -eq $value) { $store.Remove($name) } else { $store[$name]=$value } }
$save = { param($phase) $phases.Add($phase) }
Set-OwnedTestValues $desired $read $write $save
Assert-True ($store.Count -eq 3 -and ($phases -join ',') -eq 'prepared,created') 'Creation must persist ownership before writes'
Remove-OwnedTestValues $desired $read $write $save
Assert-True ($store.Count -eq 0 -and $phases[-1] -eq 'removed') 'All owned values must be removed'
$count=$events.Count; Remove-OwnedTestValues $desired $read $write $save
Assert-True ($events.Count -eq $count) 'Second cleanup must not write'

$store.config='existing'; $events.Clear(); $phases.Clear()
Reject { Set-OwnedTestValues $desired $read $write $save } 'Existing value'
Assert-True ($store.config -eq 'existing' -and $events.Count -eq 0 -and $phases.Count -eq 0) 'Pre-existing values must survive without writes'
$store.Clear()
$partialWrite = { param($name,$value) if ($name -eq 'state') { throw 'Simulated write interruption' }; & $write $name $value }
Reject { Set-OwnedTestValues $desired $read $partialWrite $save } 'Simulated write interruption'
Assert-True ($store.Count -eq 1 -and $phases[-1] -eq 'prepared') 'Partial setup must retain prepared ownership'
Remove-OwnedTestValues $desired $read $write $save
Assert-True ($store.Count -eq 0) 'Partial setup must clean only created values'

Set-OwnedTestValues $desired $read $write $save
$store.state='changed-by-another-owner'; $events.Clear()
Reject { Remove-OwnedTestValues $desired $read $write $save } 'Changed value'
Assert-True ($events.Count -eq 0 -and $store.Count -eq 3 -and $store.state -eq 'changed-by-another-owner') 'Conflicting ownership must preserve every value'
$store.Clear(); $phases.Clear()
$noWrite = { param($name,$value) }
Reject { Set-OwnedTestValues $desired $read $noWrite $save } 'readback failed'
Assert-True ($phases[-1] -eq 'prepared') 'Missing readback must never claim successful setup'
Write-Output 'Passed pure ownership tests: creation, cleanup, duplicate cleanup, existing value, interrupted setup, changed owner, failed readback. No OS settings accessed.'
