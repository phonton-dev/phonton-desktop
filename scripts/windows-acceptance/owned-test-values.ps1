# Pure value ownership protocol. Tests supply in-memory adapters; only the guarded
# cloud entrypoint supplies the user-environment and per-executable registry adapters.
function Set-OwnedTestValues {
    param([System.Collections.IDictionary]$Values, [scriptblock]$ReadValue, [scriptblock]$WriteValue, [scriptblock]$SavePhase)
    foreach ($name in $Values.Keys) {
        if ($null -ne (& $ReadValue $name)) { throw "Existing value must be preserved: $name" }
    }
    & $SavePhase 'prepared'
    foreach ($name in $Values.Keys) {
        if ($null -ne (& $ReadValue $name)) { throw "Value appeared before write: $name" }
        & $WriteValue $name $Values[$name]
        if ((& $ReadValue $name) -cne $Values[$name]) { throw "Value readback failed: $name" }
    }
    & $SavePhase 'created'
}

function Remove-OwnedTestValues {
    param([System.Collections.IDictionary]$Values, [scriptblock]$ReadValue, [scriptblock]$WriteValue, [scriptblock]$SavePhase)
    foreach ($name in $Values.Keys) {
        $current = & $ReadValue $name
        if ($null -ne $current -and $current -cne $Values[$name]) { throw "Changed value must be preserved: $name" }
    }
    foreach ($name in $Values.Keys) {
        $current = & $ReadValue $name
        if ($null -ne $current) {
            if ($current -cne $Values[$name]) { throw "Value changed before cleanup: $name" }
            & $WriteValue $name $null
        }
        if ($null -ne (& $ReadValue $name)) { throw "Cleanup readback failed: $name" }
    }
    & $SavePhase 'removed'
}
