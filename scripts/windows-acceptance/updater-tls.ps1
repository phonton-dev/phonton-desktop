param([Parameter(Mandatory)][ValidateSet('create', 'cleanup')][string]$Action)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows' -or
    $env:RUNNER_ENVIRONMENT -ne 'github-hosted' -or $env:GITHUB_EVENT_NAME -ne 'workflow_dispatch' -or
    $env:GITHUB_REPOSITORY -ne 'phonton-dev/phonton-desktop') { throw 'Manual disposable Windows Actions runner required' }
if (!$env:RUNNER_TEMP -or !(Test-Path -LiteralPath $env:RUNNER_TEMP -PathType Container)) { throw 'Runner temp missing' }
$temporary = (Resolve-Path -LiteralPath $env:RUNNER_TEMP).Path
$directory = [IO.Path]::GetFullPath((Join-Path $temporary 'phonton-updater-tls'))
$prefix = [IO.Path]::GetFullPath($temporary).TrimEnd('\') + '\'
if (!$directory.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'TLS directory outside runner temp' }
$statePath = Join-Path $directory 'state.json'
$certificatePath = Join-Path $directory 'localhost.pem'
$keyPath = Join-Path $directory 'localhost-key.pem'
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (!$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Disposable hosted runner administrator required; no elevation or user-store fallback' }
function Write-TlsStage([string]$Stage) {
    @{ schema=1; action=$Action; stage=$Stage; runId=$env:GITHUB_RUN_ID; runAttempt=$env:GITHUB_RUN_ATTEMPT;
        store='LocalMachine/Root'; utc=[DateTimeOffset]::UtcNow.ToString('o') } |
        ConvertTo-Json -Compress | Add-Content -LiteralPath 'acceptance-evidence/updater-tls-stages.jsonl' -Encoding utf8
}
# CurrentUser/Root can show a modal trust prompt. This disposable machine store
# is changed only for the exact short-lived fixture identity and removed below.
Write-TlsStage 'open-store'
$store = [Security.Cryptography.X509Certificates.X509Store]::new('Root', 'LocalMachine')
$store.Open([Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
try {
    if ($Action -eq 'create') {
        if (Test-Path -LiteralPath $directory) { throw 'TLS directory must be fresh' }
        New-Item -ItemType Directory -Path $directory | Out-Null
        $rsa = [Security.Cryptography.RSA]::Create(2048)
        $certificate = $null
        $public = $null
        $added = $false
        try {
            $request = [Security.Cryptography.X509Certificates.CertificateRequest]::new(
                'CN=localhost', $rsa, [Security.Cryptography.HashAlgorithmName]::SHA256,
                [Security.Cryptography.RSASignaturePadding]::Pkcs1)
            $san = [Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
            $san.AddDnsName('localhost')
            $san.AddIpAddress([Net.IPAddress]::Loopback)
            $request.CertificateExtensions.Add($san.Build())
            $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true))
            $usage = [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment
            $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new($usage, $true))
            $purposes = [Security.Cryptography.OidCollection]::new()
            $null = $purposes.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1'))
            $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($purposes, $false))
            $certificate = $request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-1), [DateTimeOffset]::UtcNow.AddHours(3))
            $public = [Security.Cryptography.X509Certificates.X509Certificate2]::new($certificate.RawData)
            if ($public.HasPrivateKey) { throw 'Only public TLS certificate may enter runner trust store' }
            if ($store.Certificates.Find('FindByThumbprint', $public.Thumbprint, $false).Count -ne 0) { throw 'Certificate already trusted' }
            $state = [ordered]@{ schema=1; runId=$env:GITHUB_RUN_ID; runAttempt=$env:GITHUB_RUN_ATTEMPT; thumbprint=$public.Thumbprint;
                certificateSha256=$public.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256).ToLowerInvariant();
                store='LocalMachine/Root'; subject=$public.Subject; notBefore=$public.NotBefore.ToUniversalTime().ToString('o');
                notAfter=$public.NotAfter.ToUniversalTime().ToString('o'); privateKeyInStore=$false }
            # Save removal identity before trusting it, so cleanup can recover a later failure.
            $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding utf8
            [IO.File]::WriteAllText($certificatePath, $public.ExportCertificatePem())
            [IO.File]::WriteAllText($keyPath, $rsa.ExportPkcs8PrivateKeyPem())
            Write-TlsStage 'trust-add-start'
            $store.Add($public)
            Write-TlsStage 'trust-add-returned'
            $added = $true
            $trusted = $store.Certificates.Find('FindByThumbprint', $public.Thumbprint, $false)
            if ($trusted.Count -ne 1 -or $trusted[0].HasPrivateKey) { throw 'Public TLS trust readback failed' }
            $state | ConvertTo-Json | Set-Content -LiteralPath 'acceptance-evidence/updater-tls-created.json' -Encoding utf8
            Write-TlsStage 'trust-readback-passed'
        } catch {
            if ($added -and $null -ne $public) { $store.Remove($public) }
            if (Test-Path -LiteralPath $keyPath) { Remove-Item -LiteralPath $keyPath }
            throw
        } finally {
            if ($null -ne $public) { $public.Dispose() }
            if ($null -ne $certificate) { $certificate.Dispose() }
            $rsa.Dispose()
        }
    } else {
        if (!(Test-Path -LiteralPath $directory)) { return }
        if ((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'TLS directory cannot be a link' }
        if (!(Test-Path -LiteralPath $statePath)) { throw 'TLS cleanup identity is missing' }
        $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        if ($state.schema -ne 1 -or $state.runId -ne $env:GITHUB_RUN_ID -or $state.runAttempt -ne $env:GITHUB_RUN_ATTEMPT -or
            $state.store -ne 'LocalMachine/Root' -or $state.thumbprint -notmatch '^[A-F0-9]{40}$' -or
            $state.certificateSha256 -notmatch '^[a-f0-9]{64}$') { throw 'TLS cleanup identity mismatch' }
        $matches = $store.Certificates.Find('FindByThumbprint', $state.thumbprint, $false)
        foreach ($entry in $matches) {
            if ($entry.GetCertHashString([Security.Cryptography.HashAlgorithmName]::SHA256).ToLowerInvariant() -ne $state.certificateSha256 -or $entry.HasPrivateKey) { throw 'Refusing to remove an unexpected certificate' }
            Write-TlsStage 'trust-remove-start'
            $store.Remove($entry)
            Write-TlsStage 'trust-remove-returned'
        }
        if ($store.Certificates.Find('FindByThumbprint', $state.thumbprint, $false).Count -ne 0) { throw 'TLS trust cleanup failed' }
        # Delete only our exact files, never recursively delete a computed directory.
        foreach ($file in @($keyPath, $certificatePath, $statePath)) {
            if (Test-Path -LiteralPath $file) {
                $item = Get-Item -LiteralPath $file
                if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'TLS files cannot be links' }
                if (!$item.FullName.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'TLS cleanup outside runner temp' }
                Remove-Item -LiteralPath $file
            }
        }
        Remove-Item -LiteralPath $directory
        @{ schema=1; store='LocalMachine/Root'; thumbprint=$state.thumbprint; publicTrustRemoved=$true; privateKeyFileRemoved=$true } |
            ConvertTo-Json | Set-Content -LiteralPath 'acceptance-evidence/updater-tls-cleanup.json' -Encoding utf8
        Write-TlsStage 'cleanup-readback-passed'
    }
} finally { $store.Dispose() }
