$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'Disposable Windows Actions runner required' }
$evidence = New-Item -ItemType Directory -Force acceptance-evidence
$runtimeRoot = Join-Path ${env:ProgramFiles(x86)} 'Microsoft\EdgeWebView\Application'
$runtime = Get-ChildItem -LiteralPath $runtimeRoot -Directory | Where-Object Name -Match '^\d+\.\d+\.\d+\.\d+$' | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1
if (!$runtime) { throw 'WebView2 Runtime missing' }
$build = (($runtime.Name -split '\.')[0..2] -join '.')
$driverRoot = Join-Path $env:RUNNER_TEMP 'phonton-webdriver'
New-Item -ItemType Directory -Force $driverRoot | Out-Null
$archive = Join-Path $driverRoot 'edgedriver.zip'
$version = $runtime.Name
try {
    Invoke-WebRequest "https://msedgedriver.microsoft.com/$version/edgedriver_win64.zip" -OutFile $archive
} catch {
    if ($_.Exception.Response.StatusCode -ne 404) { throw }
    $major = ($runtime.Name -split '\.')[0]
    $versionFile = Join-Path $driverRoot 'latest-version.txt'
    Invoke-WebRequest "https://msedgedriver.microsoft.com/LATEST_RELEASE_${major}_WINDOWS" -OutFile $versionFile
    # Microsoft's version endpoint uses UTF-16LE; StreamReader detects the BOM.
    $version = [IO.File]::ReadAllText($versionFile, [Text.Encoding]::Unicode).Trim([char]0xFEFF).Trim()
    if ($version -notmatch '^\d+\.\d+\.\d+\.\d+$' -or !$version.StartsWith("$build.")) { throw "No driver matching installed WebView2 $($runtime.Name); latest is $version" }
    Invoke-WebRequest "https://msedgedriver.microsoft.com/$version/edgedriver_win64.zip" -OutFile $archive
}
Expand-Archive -LiteralPath $archive -DestinationPath $driverRoot
$driver = Join-Path $driverRoot 'msedgedriver.exe'
$signature = Get-AuthenticodeSignature -LiteralPath $driver
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Microsoft Corporation') { throw 'EdgeDriver Microsoft signature invalid' }
@{ webview2 = $runtime.Name; edgeDriver = $version; driverSha256 = (Get-FileHash $driver).Hash.ToLowerInvariant(); signature = $signature.Status.ToString() } | ConvertTo-Json | Set-Content (Join-Path $evidence 'driver.json')
"PHONTON_EDGE_DRIVER=$driver" >> $env:GITHUB_ENV
