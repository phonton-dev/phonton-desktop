param([Parameter(Mandatory)][string]$InstallerPath)
$ErrorActionPreference = 'Stop'
# OpenDatabase mode 0 is read-only: this never installs or executes the package.
$installer = New-Object -ComObject WindowsInstaller.Installer
$database = $installer.OpenDatabase((Resolve-Path -LiteralPath $InstallerPath).Path, 0)
function Read-MsiTable([string]$Query, [string[]]$Columns) {
    $view = $database.OpenView($Query)
    try {
        $null = $view.Execute()
        while ($record = $view.Fetch()) {
            $row = [ordered]@{}
            for ($index = 0; $index -lt $Columns.Count; $index++) {
                $row[$Columns[$index]] = $record.StringData($index + 1)
            }
            [pscustomobject]$row
        }
    } finally { $null = $view.Close() }
}
$files = @(Read-MsiTable 'SELECT `File`.`File`, `File`.`FileName`, `Component`.`Directory_` FROM `File`, `Component` WHERE `File`.`Component_` = `Component`.`Component`' @('id', 'name', 'directory'))
$directories = @(Read-MsiTable 'SELECT `Directory`, `Directory_Parent`, `DefaultDir` FROM `Directory`' @('id', 'parent', 'name'))
$properties = @{}
foreach ($row in @(Read-MsiTable 'SELECT `Property`, `Value` FROM `Property`' @('name', 'value'))) {
    if ($row.name -in @('ProductCode', 'ProductVersion', 'ProductName', 'UpgradeCode')) { $properties[$row.name] = $row.value }
}
@{ files = $files; directories = $directories; properties = $properties } | ConvertTo-Json -Depth 5
