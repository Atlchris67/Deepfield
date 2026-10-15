[CmdletBinding()]
param(
    [ValidateSet('Plan','Preflight','Sign','Verify')][string]$Mode='Plan',
    [Parameter(Mandatory)][string]$StageDirectory,
    [string]$CertificateThumbprint,
    [ValidateSet('CurrentUser','LocalMachine')][string]$StoreLocation='CurrentUser',
    [string]$SignToolPath,
    [string]$TimestampUrl
)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSScriptRoot 'SigningPlan.psm1') -Force
$repo=Split-Path -Parent $PSScriptRoot
$plan=Get-DeepfieldSigningPlan -RepositoryRoot $repo -StageDirectory $StageDirectory
if ($Mode -eq 'Plan') { $plan | ConvertTo-Json -Depth 5; return }
# Validate configuration before accessing certificates or invoking any program.
if ($CertificateThumbprint -notmatch '^[0-9a-fA-F]{40}$') { throw 'Supply the exact expected signer certificate thumbprint.' }
if ($Mode -ne 'Verify') { $null=Get-DeepfieldSignArguments -Thumbprint $CertificateThumbprint -TimestampUrl $TimestampUrl -StoreLocation $StoreLocation -File $plan.Targets[0].Path }
if (-not $SignToolPath -or -not (Test-Path -LiteralPath $SignToolPath -PathType Leaf)) { throw 'Supply an already installed Windows SDK signtool.exe using -SignToolPath. Nothing is installed automatically.' }
if (-not $IsWindows) { throw 'Certificate preflight/signature verification require Windows.' }
$tool=Get-Item -LiteralPath $SignToolPath
if ($tool.Name -ne 'signtool.exe' -or $tool.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Use a literal, non-linked signtool.exe path.' }
$toolSignature=Get-AuthenticodeSignature -LiteralPath $tool.FullName
if ($toolSignature.Status -ne 'Valid' -or $toolSignature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation(?:,|$)') { throw 'SignTool must have a valid Microsoft Authenticode signature.' }
function Verify-Target([string]$path) {
    & $tool.FullName verify /pa /all /tw /v $path
    if ($LASTEXITCODE -ne 0) { throw "SignTool verification failed or warned: $path" }
    $signature=Get-AuthenticodeSignature -LiteralPath $path
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne $CertificateThumbprint -or $null -eq $signature.TimeStamperCertificate) { throw "Expected trusted signer and timestamp not found: $path" }
}
if ($Mode -eq 'Verify') { foreach($target in $plan.Targets) { Verify-Target $target.Path }; Write-Output 'Signature verification passed. This does not authorize or prove Smart App Control execution.'; return }
$certificate=Get-Item -LiteralPath "Cert:\$StoreLocation\My\$CertificateThumbprint" -ErrorAction Stop
if ($certificate.Subject -eq $certificate.Issuer) { throw 'Self-signed signing certificates are not supported.' }
if ($certificate.NotBefore -gt (Get-Date) -or $certificate.NotAfter -le (Get-Date)) { throw 'Signing certificate is not currently valid.' }
if ($certificate.PublicKey.Oid.Value -ne '1.2.840.113549.1.1.1') { throw 'This Smart App Control workflow requires an RSA code-signing certificate.' }
$eku=@($certificate.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.37' } | ForEach-Object { $_.EnhancedKeyUsages } | ForEach-Object Value)
if ('1.3.6.1.5.5.7.3.3' -notin $eku) { throw 'Certificate lacks the code-signing EKU.' }
if ($Mode -ne 'Verify' -and -not $certificate.HasPrivateKey) { throw 'Selected certificate has no accessible private-key association. Configure the chosen provider separately; this workflow does not install or import it.' }
$chain=[Security.Cryptography.X509Certificates.X509Chain]::new()
try {
    $chain.ChainPolicy.DisableCertificateDownloads=$true
    $chain.ChainPolicy.RevocationMode='NoCheck'
    $chain.ChainPolicy.ApplicationPolicy.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3'))
    if (-not $chain.Build($certificate) -or $chain.ChainElements.Count -lt 2) { throw 'Certificate must chain to existing Windows trust using locally available intermediates. Trust is never modified.' }
} finally { $chain.Dispose() }
if ($Mode -eq 'Preflight') {
    Write-Output 'Preflight passed: configuration and local chain only. No signing/provider invocation. Revocation, timestamp service, private-key access and Smart App Control acceptance are NOT proven.'
    return
}
# Fail before signing ANY file if an original could be modified through a hard link,
# or if this would replace an existing signature. No dependency is passed to SignTool.
foreach ($target in $plan.Targets) {
    $links=@(& "$env:SystemRoot\System32\fsutil.exe" hardlink list $target.Path)
    if ($LASTEXITCODE -ne 0 -or @($links | Where-Object { $_.Trim() }).Count -ne 1) { throw "Cannot prove a single staged hard link: $($target.Path)" }
    if ((Get-AuthenticodeSignature -LiteralPath $target.Path).Status -ne 'NotSigned') { throw "Stage fresh unsigned outputs; refusing to replace an existing or invalid signature: $($target.Path)" }
}
$records=@();$status='Failed'
try {
    foreach ($target in $plan.Targets) {
        if ((Get-FileHash -LiteralPath $target.Path -Algorithm SHA256).Hash -ne $target.SHA256) { throw 'Staged file changed after planning. Stop concurrent writes and start again.' }
        $arguments=Get-DeepfieldSignArguments -Thumbprint $CertificateThumbprint -TimestampUrl $TimestampUrl -StoreLocation $StoreLocation -File $target.Path
        & $tool.FullName @arguments
        if ($LASTEXITCODE -ne 0) { throw "Signing failed or warned: $($target.Name). Staged files may be partially signed; do not distribute." }
        Verify-Target $target.Path
        $records += [pscustomobject]@{Name=$target.Name;BeforeSHA256=$target.SHA256;AfterSHA256=(Get-FileHash -LiteralPath $target.Path -Algorithm SHA256).Hash}
    }
    $status='VerifiedSignatures'
} finally {
    $report=Join-Path $plan.StageDirectory ('signing-report-'+[guid]::NewGuid()+'.json')
    [pscustomobject]@{Status=$status;Utc=[DateTimeOffset]::UtcNow;CertificateThumbprint=$CertificateThumbprint;VerifiedFiles=$records;Excluded=$plan.Excluded;Note='Not an application execution test or SAC approval.'} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $report
    Write-Output "Signing report: $report"
}
