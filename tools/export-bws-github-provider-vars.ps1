param(
  [string]$ProjectId = $env:AI_LINK_BWS_CI_PROJECT_ID,
  [string]$ManifestPath = ".ai-link/bitwarden-secrets.manifest.json",
  [string]$EnvironmentKey = "providerLive",
  [string]$OutputPath = "runtime/tmp/bws-github-provider-live-vars.md",
  [switch]$Force,
  [switch]$Print,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

function Show-Help {
  Write-Host @"
BWS GitHub provider-live variable helper

Usage:
  powershell -ExecutionPolicy Bypass -File tools/export-bws-github-provider-vars.ps1 -ProjectId <ai-link-ci-project-id>

Default:
  Reads Bitwarden secret metadata from the configured CI project, maps secret
  IDs to the GitHub Environment variable names in the public manifest, and
  writes a non-secret worksheet to:

    runtime/tmp/bws-github-provider-live-vars.md

Examples:
  `$env:AI_LINK_BWS_CI_PROJECT_ID="<ai-link-ci-project-id>"
  npm run bws:github-vars
  powershell -ExecutionPolicy Bypass -File tools/export-bws-github-provider-vars.ps1 -ProjectId "<ai-link-ci-project-id>" -Print

Safety:
  - This command prints Bitwarden secret IDs, not secret values.
  - Do not commit the generated runtime/tmp file.
  - Keep BWS_ACCESS_TOKEN only in the current local session.
"@
}

function Fail($message) {
  Write-Error $message
  exit 1
}

function Resolve-RepoPath {
  param([string]$Path)
  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }
  return [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Path))
}

function Test-RuntimeTmpTarget {
  param([string]$Path)
  $runtimeTmp = Resolve-RepoPath "runtime/tmp"
  $target = Resolve-RepoPath $Path
  $runtimePrefix = $runtimeTmp.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  return $target.StartsWith($runtimePrefix, [System.StringComparison]::OrdinalIgnoreCase)
}

function Resolve-BwsPath {
  $command = Get-Command bws -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $defaultPath = Join-Path $env:LOCALAPPDATA "Programs\BitwardenSecretsManager\bin\bws.exe"
  if (Test-Path -LiteralPath $defaultPath) {
    return $defaultPath
  }

  return $null
}

function Collect-Secrets($value) {
  $items = @()
  if ($null -eq $value) {
    return $items
  }

  if ($value -is [System.Array]) {
    foreach ($item in $value) {
      $items += Collect-Secrets $item
    }
    return $items
  }

  $propertyNames = @($value.PSObject.Properties.Name)
  $name = $null
  if ($propertyNames -contains "key") {
    $name = [string]$value.key
  } elseif ($propertyNames -contains "name") {
    $name = [string]$value.name
  }

  if ($name -and ($propertyNames -contains "id")) {
    $items += [pscustomobject]@{
      name = $name
      id = [string]$value.id
    }
  }

  if ($propertyNames -contains "data") {
    $items += Collect-Secrets $value.data
  }
  if ($propertyNames -contains "items") {
    $items += Collect-Secrets $value.items
  }

  return $items
}

if ($Help) {
  Show-Help
  exit 0
}

if (-not (Test-Path -LiteralPath $ManifestPath)) {
  Fail "Manifest not found: $ManifestPath"
}

if (-not $Print -and -not (Test-RuntimeTmpTarget $OutputPath)) {
  Fail "Refusing to write GitHub provider-live variables outside runtime/tmp."
}

if (-not $Print -and (Test-Path -LiteralPath $OutputPath) -and -not $Force) {
  Fail "Output file already exists: $OutputPath. Pass -Force to overwrite."
}

if ([string]::IsNullOrWhiteSpace($ProjectId)) {
  Fail "Missing Bitwarden CI project id. Pass -ProjectId or set AI_LINK_BWS_CI_PROJECT_ID."
}

if ([string]::IsNullOrWhiteSpace($env:BWS_ACCESS_TOKEN)) {
  Fail "Missing BWS_ACCESS_TOKEN in the current session. Do not write it into project files."
}

$bwsPath = Resolve-BwsPath
if (-not $bwsPath) {
  Fail "Bitwarden Secrets Manager CLI (bws) was not found."
}

$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $ManifestPath | ConvertFrom-Json
$environment = $manifest.githubEnvironments.$EnvironmentKey
if (-not $environment) {
  Fail "GitHub environment '$EnvironmentKey' was not found in $ManifestPath."
}

$rawSecrets = & $bwsPath secret list $ProjectId --output json
$secretItems = @(Collect-Secrets ($rawSecrets | ConvertFrom-Json))

$lines = New-Object System.Collections.Generic.List[string]
function Add-Line {
  param([string]$Line = "")
  $lines.Add($Line) | Out-Null
}

Add-Line "# GitHub Provider Live Variables"
Add-Line ""
Add-Line "Generated from Bitwarden project metadata and ``$ManifestPath``."
Add-Line ""
Add-Line "Safety rules:"
Add-Line "- Values below are Bitwarden secret IDs, not secret values."
Add-Line "- Store these IDs as GitHub Environment variables, not GitHub Secrets."
Add-Line "- Store ``$($environment.bootstrapSecret)`` as the GitHub Environment Secret."
Add-Line "- Do not commit this generated file."
Add-Line ""
Add-Line "Environment: ``$($environment.name)``"
Add-Line ""
Add-Line "| Bitwarden secret key | GitHub Environment variable | Bitwarden secret ID | Status |"
Add-Line "| --- | --- | --- | --- |"

$missing = @()
foreach ($secretVariable in $environment.secretIdVariables.PSObject.Properties) {
  $secretKey = [string]$secretVariable.Name
  $githubVariable = [string]$secretVariable.Value
  $matches = @($secretItems | Where-Object { $_.name -eq $secretKey })
  if ($matches.Count -eq 1) {
    Add-Line "| ``$secretKey`` | ``$githubVariable`` | ``$($matches[0].id)`` | ok |"
  } elseif ($matches.Count -gt 1) {
    $missing += $secretKey
    Add-Line "| ``$secretKey`` | ``$githubVariable`` | duplicate secret names found | fix duplicates |"
  } else {
    $missing += $secretKey
    Add-Line "| ``$secretKey`` | ``$githubVariable`` | missing | create in Bitwarden |"
  }
}

Add-Line ""
Add-Line "Validation commands:"
Add-Line ""
Add-Line '```powershell'
Add-Line 'npm run providers:github:check'
Add-Line 'npm run providers:github:remote-check'
Add-Line '```'

$content = ($lines -join [Environment]::NewLine) + [Environment]::NewLine

if ($Print) {
  Write-Output $content
} else {
  $resolvedOutputPath = Resolve-RepoPath $OutputPath
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resolvedOutputPath) | Out-Null
  Set-Content -LiteralPath $resolvedOutputPath -Value $content -Encoding UTF8
  Write-Host "GitHub provider-live variables written to $OutputPath"
}

if ($missing.Count -gt 0) {
  Write-Host ("Missing or ambiguous secret IDs: " + ($missing -join ", "))
  exit 1
}
