Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-DeepfieldSigningPlan {
    param([Parameter(Mandatory)][string]$RepositoryRoot,[Parameter(Mandatory)][string]$StageDirectory)
    $root = [IO.Path]::GetFullPath((Join-Path $RepositoryRoot 'artifacts/signing'))
    $stage = [IO.Path]::GetFullPath($StageDirectory)
    if (-not $stage.StartsWith($root + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
        throw 'Use a dedicated child directory under this checkout artifacts/signing; never bin, data or the live checkout.'
    }
    $directory = Get-Item -LiteralPath $stage -ErrorAction Stop
    if (-not $directory.PSIsContainer) { throw 'StageDirectory must be a directory.' }
    # Reject junctions/symlinks at every ancestor, including the checkout itself.
    for ($item=$directory; $null -ne $item; $item=$item.Parent) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse points are not allowed in the staging path.' }
    }
    $allowed = @('Deepfield.Api.dll','Deepfield.Engine.dll','Deepfield.Api.exe')
    $files = @(Get-ChildItem -LiteralPath $stage -File)
    foreach ($file in $files) {
        if ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Staged file links are not allowed.' }
        if ($file.Name -like 'Deepfield.*' -and $file.Extension -in @('.dll','.exe') -and $file.Name -notin $allowed) {
            throw "Unapproved first-party binary: $($file.Name). Update the reviewed allowlist explicitly."
        }
    }
    foreach ($required in @('Deepfield.Api.dll','Deepfield.Engine.dll')) {
        if ($required -notin $files.Name) { throw "Missing staged first-party output: $required" }
    }
    $targets = @($files | Where-Object Name -In $allowed | Sort-Object Name | ForEach-Object {
        # A hard link would permit signing to modify an unstaged original too.
        # Read-only hard-link inspection is required later on Windows before Sign.
        [pscustomobject]@{ Path=$_.FullName; Name=$_.Name; SHA256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
    })
    [pscustomobject]@{ StageDirectory=$stage; Targets=$targets; Excluded=@($files | Where-Object Name -NotIn $allowed | Select-Object -ExpandProperty Name); State='PlanOnly'; Note='No certificate, signer, network, trust or application execution has occurred.' }
}

function Get-DeepfieldSignArguments {
    param([string]$Thumbprint,[string]$TimestampUrl,[ValidateSet('CurrentUser','LocalMachine')][string]$StoreLocation='CurrentUser',[string]$File)
    if ($Thumbprint -notmatch '^[0-9a-fA-F]{40}$') { throw 'Supply the exact 40-hex certificate thumbprint; automatic certificate selection is not supported.' }
    $uri=$null
    if (-not [Uri]::TryCreate($TimestampUrl,[UriKind]::Absolute,[ref]$uri) -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Fragment) {
        throw 'Supply an explicit HTTPS RFC3161 timestamp URL without credentials or fragment.'
    }
    $result=@('sign','/fd','SHA256','/sha1',$Thumbprint,'/s','My','/tr',$TimestampUrl,'/td','SHA256')
    if ($StoreLocation -eq 'LocalMachine') { $result += '/sm' }
    $result += $File
    return ,$result
}
Export-ModuleMember -Function Get-DeepfieldSigningPlan,Get-DeepfieldSignArguments
