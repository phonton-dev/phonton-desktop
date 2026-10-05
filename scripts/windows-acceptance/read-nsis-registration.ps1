$ErrorActionPreference = 'Stop'
$uninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall'
$productKey = 'Software\phonton\Phonton'
$registrations = @()
$savedDirectories = @()
foreach ($hive in @('CurrentUser', 'LocalMachine')) {
    foreach ($view in @('Registry64', 'Registry32')) {
        $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::$hive, [Microsoft.Win32.RegistryView]::$view)
        try {
            $products = $base.OpenSubKey($uninstallKey)
            if ($null -ne $products) {
                try {
                    foreach ($name in $products.GetSubKeyNames()) {
                        $key = $products.OpenSubKey($name)
                        if ($null -eq $key) { continue }
                        try {
                            if ($name -like '*phonton*' -or [string]$key.GetValue('DisplayName') -like '*phonton*') {
                                $values = @{}
                                foreach ($field in @('DisplayName', 'DisplayVersion', 'Publisher', 'MainBinaryName', 'InstallLocation', 'UninstallString', 'NoModify', 'NoRepair')) { $values[$field] = $key.GetValue($field) }
                                $registrations += @{ hive = $hive; view = $view; key = "$uninstallKey\$name"; values = $values }
                            }
                        } finally { $key.Dispose() }
                    }
                } finally { $products.Dispose() }
            }
            $product = $base.OpenSubKey($productKey)
            if ($null -ne $product) {
                try { $savedDirectories += @{ hive = $hive; view = $view; key = $productKey; directory = $product.GetValue('') } }
                finally { $product.Dispose() }
            }
        } finally { $base.Dispose() }
    }
}
@{ schema = 1; registrations = @($registrations); savedDirectories = @($savedDirectories) } | ConvertTo-Json -Depth 8
