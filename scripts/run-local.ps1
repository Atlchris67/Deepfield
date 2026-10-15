param([switch]$Accelerated, [switch]$HumanEmpire, [switch]$EconomyPreview)
$ErrorActionPreference = 'Stop'
if (-not $env:Teams__0__Key -or -not $env:Teams__1__Key) {
    throw 'Set distinct process-local Teams__0__Key and Teams__1__Key values first (minimum 24 characters). See README.'
}
$repoRoot = Split-Path -Parent $PSScriptRoot
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:ASPNETCORE_URLS = 'http://127.0.0.1:5080'
$env:LocalTest = $Accelerated.IsPresent.ToString()
$env:EmpireAi = (-not $HumanEmpire.IsPresent).ToString()
$env:EconomyVersion = if ($EconomyPreview) { '1' } else { '0' }
if (-not $env:SavePath) { $env:SavePath = Join-Path $repoRoot 'data/campaign.json' }
dotnet run --project (Join-Path $repoRoot 'src/Deepfield.Api') --no-launch-profile --no-build
exit $LASTEXITCODE
