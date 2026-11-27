# Pure planning/configuration checks. Fixture .dll files contain text, never PE code.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
Import-Module (Join-Path $repo 'scripts/SigningPlan.psm1') -Force
$stage=Join-Path $repo ('artifacts/signing/checks-'+[guid]::NewGuid())
$null=New-Item -ItemType Directory -Path $stage
$script:checks=0
function Check([bool]$condition,[string]$message) { if(-not $condition){throw $message};$script:checks++;Write-Output "PASS $message" }
function Reject([scriptblock]$action,[string]$message) { $failed=$false;try{& $action | Out-Null}catch{$failed=$true};Check $failed $message }
try {
    foreach($name in @('Deepfield.Api.dll','Deepfield.Engine.dll','Deepfield.Api.exe','Npgsql.dll','Deepfield.Api.deps.json')) {
        [IO.File]::WriteAllText((Join-Path $stage $name),'non-executable test fixture '+$name)
    }
    $before=@(Get-ChildItem -LiteralPath $stage -File | Get-FileHash | Select-Object Path,Hash) | ConvertTo-Json
    $plan=Get-DeepfieldSigningPlan -RepositoryRoot $repo -StageDirectory $stage
    Check ($plan.Targets.Count -eq 3) 'Only the three allowlisted first-party artifacts are targets'
    Check ('Npgsql.dll' -in $plan.Excluded -and 'Deepfield.Api.deps.json' -in $plan.Excluded) 'Third-party dependency and metadata are excluded'
    Check ($plan.Targets[0].SHA256.Length -eq 64) 'Plan includes SHA256 hashes'
    $json=& (Join-Path $repo 'scripts/sign-build.ps1') -StageDirectory $stage
    Check (($json | ConvertFrom-Json).State -eq 'PlanOnly') 'Default mode plans without a certificate or signing tool'
    Reject { & (Join-Path $repo 'scripts/sign-build.ps1') -Mode Preflight -StageDirectory $stage } 'Missing certificate fails closed before certificate/provider access'
    $after=@(Get-ChildItem -LiteralPath $stage -File | Get-FileHash | Select-Object Path,Hash) | ConvertTo-Json
    Check ($before -eq $after) 'Plan and rejected preflight neither alter nor add staged files'
    Reject { Get-DeepfieldSigningPlan -RepositoryRoot $repo -StageDirectory (Join-Path $repo 'src') } 'Refuses source/bin/live paths outside signing staging'
    Reject { Get-DeepfieldSigningPlan -RepositoryRoot $repo -StageDirectory (Join-Path $repo 'artifacts/signing/../outside') } 'Normalizes traversal before enforcing scope'
    Reject { Get-DeepfieldSigningPlan -RepositoryRoot $repo -StageDirectory (Join-Path $repo 'artifacts/signing-sibling/release') } 'Sibling prefix cannot escape staging scope'
    $extra=Join-Path $stage 'Deepfield.Checks.exe';[IO.File]::WriteAllText($extra,'fixture')
    Reject { Get-DeepfieldSigningPlan -RepositoryRoot $repo -StageDirectory $stage } 'Unknown first-party executables require explicit allowlist review'
    Remove-Item -LiteralPath $extra
    $engine=Join-Path $stage 'Deepfield.Engine.dll';Remove-Item -LiteralPath $engine
    Reject { Get-DeepfieldSigningPlan -RepositoryRoot $repo -StageDirectory $stage } 'Missing engine output fails clearly'
    $thumb='A'*40;$file=Join-Path $stage 'path with spaces.dll'
    $args=Get-DeepfieldSignArguments -Thumbprint $thumb -TimestampUrl 'https://timestamp.example.invalid/rfc3161' -File $file
    Check ($args[-1] -eq $file -and '/a' -notin $args -and '/f' -notin $args -and '/p' -notin $args) 'Arguments preserve literal paths and never auto-select certificates or expose PFX passwords'
    Check (($args -join ' ') -match '/fd SHA256' -and ($args -join ' ') -match '/td SHA256') 'Signing and timestamp digests use SHA256'
    Check ('/sm' -notin $args) 'CurrentUser is the default certificate store'
    $machine=Get-DeepfieldSignArguments -Thumbprint $thumb -TimestampUrl 'https://timestamp.example.invalid' -StoreLocation LocalMachine -File $file
    Check ('/sm' -in $machine) 'LocalMachine selection is explicit'
    Reject { Get-DeepfieldSignArguments -Thumbprint 'auto' -TimestampUrl 'https://timestamp.example.invalid' -File $file } 'Invalid thumbprint is rejected'
    foreach($url in @('http://timestamp.example.invalid','https://user:secret@timestamp.example.invalid','file:///tmp/timestamp','https://timestamp.example.invalid/#fragment')) {
        Reject { Get-DeepfieldSignArguments -Thumbprint $thumb -TimestampUrl $url -File $file } 'Unsafe timestamp URL is rejected'
    }
    foreach($script in @('scripts/sign-build.ps1','scripts/SigningPlan.psm1','tests/signing-checks.ps1')) {
        $tokens=$null;$errors=$null;$null=[Management.Automation.Language.Parser]::ParseFile((Join-Path $repo $script),[ref]$tokens,[ref]$errors)
        Check ($errors.Count -eq 0) "PowerShell parser accepts $script"
    }
    Write-Output "$script:checks signing planner/configuration checks passed. No signing, certificate access, network requests or Deepfield execution."
} finally {
    $resolved=[IO.Path]::GetFullPath($stage)
    $expected=[IO.Path]::GetFullPath((Join-Path $repo 'artifacts/signing'))+[IO.Path]::DirectorySeparatorChar
    if($resolved.StartsWith($expected,[StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolved) -like 'checks-*') { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
