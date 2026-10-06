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

# Execute the real adapter against an in-memory CLR string boundary. PowerShell
# converts ordinary $null to an empty string for .NET string parameters.
Add-Type -TypeDefinition @'
public static class UserEnvironmentAdapterProbe {
    public static string Name;
    public static string Value;
    public static System.EnvironmentVariableTarget Target;
    public static int Calls;
    public static void SetEnvironmentVariable(string name, string value, System.EnvironmentVariableTarget target) {
        Name = name; Value = value; Target = target; Calls++;
    }
}
'@
$parseErrors=$null; $parseTokens=$null
$entrypoint=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'updater-user-environment.ps1'),[ref]$parseTokens,[ref]$parseErrors)
Assert-True ($parseErrors.Count -eq 0) 'Adapter must parse'
$assignment=$entrypoint.FindAll({ param($node) $node -is [Management.Automation.Language.AssignmentStatementAst] -and $node.Left.Extent.Text -ceq '$write' },$true)
Assert-True ($assignment.Count -eq 1) 'Require the actual unique write adapter'
$expression=$assignment[0].Right.Find({ param($node) $node -is [Management.Automation.Language.ScriptBlockExpressionAst] },$true)
$adapterSource=$expression.ScriptBlock.Extent.Text
Assert-True ([regex]::Matches($adapterSource,'\[Environment\]::SetEnvironmentVariable').Count -ge 1) 'Require actual environment adapter calls'
$adapterSource=$adapterSource.Replace('[Environment]::SetEnvironmentVariable','[UserEnvironmentAdapterProbe]::SetEnvironmentVariable')
$adapter=[scriptblock]::Create($adapterSource.Substring(1,$adapterSource.Length-2))
& $adapter 'PHONTON_CONFIG_PATH' 'fixture-config'
Assert-True ([UserEnvironmentAdapterProbe]::Name -ceq 'PHONTON_CONFIG_PATH' -and [UserEnvironmentAdapterProbe]::Value -ceq 'fixture-config' -and [UserEnvironmentAdapterProbe]::Target -eq 'User') 'Creation must preserve exact string and user scope'
& $adapter 'PHONTON_CONFIG_PATH' $null
Assert-True ($null -eq [UserEnvironmentAdapterProbe]::Value) 'Cleanup must pass a CLR null, never an empty string'
Assert-True ([UserEnvironmentAdapterProbe]::Calls -eq 2) 'Each adapter request performs one call'
Write-Output 'Passed pure ownership and actual adapter CLR-null tests. No OS settings accessed.'
