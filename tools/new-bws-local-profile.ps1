param(
  [string]$ManifestPath = ".ai-link/bitwarden-secrets.manifest.json",
  [string]$OutputPath = "runtime/tmp/bws-local-profile.ps1",
  [string]$ProjectId = $env:AI_LINK_BWS_PROJECT_ID,
  [string]$CiProjectId = $env:AI_LINK_BWS_CI_PROJECT_ID,
  [switch]$ResolveFromBws,
  [switch]$Force,
  [switch]$Print,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

function Show-Help {
  Write-Host @"
BWS local project profile helper

Usage:
  powershell -ExecutionPolicy Bypass -File tools/new-bws-local-profile.ps1 [-ProjectId <id>] [-CiProjectId <id>] [-Print]
  powershell -ExecutionPolicy Bypass -File tools/new-bws-local-profile.ps1 -ResolveFromBws

Default:
  Writes a non-secret PowerShell profile snippet to:

    runtime/tmp/bws-local-profile.ps1

Examples:
  npm run bws:profile:print
  powershell -ExecutionPolicy Bypass -File tools/new-bws-local-profile.ps1 -ProjectId "<local-dev-id>" -CiProjectId "<ci-id>" -Force
  powershell -ExecutionPolicy Bypass -File tools/new-bws-local-profile.ps1 -ResolveFromBws -Force
  . .\runtime\tmp\bws-local-profile.ps1

Safety:
  - This command never stores BWS_ACCESS_TOKEN.
  - Project IDs are non-sensitive but generated files still stay in runtime/tmp.
  - -ResolveFromBws requires BWS_ACCESS_TOKEN in the current session and only reads project metadata.
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
  if (-not [string]::IsNullOrWhiteSpace($env:AI_LINK_BWS_CLI_PATH)) {
    $configuredPath = $env:AI_LINK_BWS_CLI_PATH
    if (-not [System.IO.Path]::IsPathRooted($configuredPath)) {
      $configuredPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $configuredPath))
    }
    if (Test-Path -LiteralPath $configuredPath) {
      return $configuredPath
    }
  }

  $command = Get-Command bws -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    $defaultPath = Join-Path $env:LOCALAPPDATA "Programs\BitwardenSecretsManager\bin\bws.exe"
    if (Test-Path -LiteralPath $defaultPath) {
      return $defaultPath
    }
  }

  return $null
}

function Escape-PowerShellString {
  param([string]$Value)
  return $Value.Replace("'", "''")
}

function Find-BwsProjectId {
  param(
    [object[]]$Projects,
    [string]$Name
  )

  $match = @($Projects | Where-Object { $_.name -eq $Name })
  if ($match.Count -eq 0) {
    return $null
  }
  if ($match.Count -gt 1) {
    Fail "Multiple Bitwarden projects named '$Name' were found; pass the project id explicitly."
  }
  return [string]$match[0].id
}

if ($Help) {
  Show-Help
  exit 0
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not (Test-Path -LiteralPath $ManifestPath)) {
  Fail "Manifest not found: $ManifestPath"
}

if (-not $Print -and -not (Test-RuntimeTmpTarget $OutputPath)) {
  Fail "Refusing to write BWS local profile outside runtime/tmp."
}

if (-not $Print -and (Test-Path -LiteralPath $OutputPath) -and -not $Force) {
  Fail "Output file already exists: $OutputPath. Pass -Force to overwrite."
}

$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $ManifestPath | ConvertFrom-Json

if ($ResolveFromBws) {
  $bwsPath = Resolve-BwsPath
  if (-not $bwsPath) {
    Fail "Bitwarden Secrets Manager CLI (bws) was not found."
  }
  if ([string]::IsNullOrWhiteSpace($env:BWS_ACCESS_TOKEN)) {
    Fail "Missing BWS_ACCESS_TOKEN in the current session. Do not write it into project files."
  }

  $rawProjects = & $bwsPath project list --output json
  if ($LASTEXITCODE -ne 0) {
    Fail "Could not list Bitwarden projects."
  }
  $projects = @($rawProjects | ConvertFrom-Json)
  $ProjectId = Find-BwsProjectId $projects $manifest.projects.localDev.name
  $CiProjectId = Find-BwsProjectId $projects $manifest.projects.ci.name
}

$hasProjectId = -not [string]::IsNullOrWhiteSpace($ProjectId)
$hasCiProjectId = -not [string]::IsNullOrWhiteSpace($CiProjectId)

$lines = New-Object System.Collections.Generic.List[string]
function Add-Line {
  param([string]$Line = "")
  $lines.Add($Line) | Out-Null
}

Add-Line "# AI Link BWS local project profile"
Add-Line "# Generated from $ManifestPath."
Add-Line "# Non-secret project IDs only. BWS_ACCESS_TOKEN is intentionally not stored here."
Add-Line "# Load into the current PowerShell session with:"
Add-Line "# . .\runtime\tmp\bws-local-profile.ps1"
Add-Line ""
if ($hasProjectId) {
  Add-Line ("`$env:AI_LINK_BWS_PROJECT_ID = '{0}'" -f (Escape-PowerShellString $ProjectId))
} else {
  Add-Line ("# `$env:AI_LINK_BWS_PROJECT_ID = '<{0}-project-id>'" -f $manifest.projects.localDev.name)
}

if ($hasCiProjectId) {
  Add-Line ("`$env:AI_LINK_BWS_CI_PROJECT_ID = '{0}'" -f (Escape-PowerShellString $CiProjectId))
} else {
  Add-Line ("# `$env:AI_LINK_BWS_CI_PROJECT_ID = '<{0}-project-id>'" -f $manifest.projects.ci.name)
}
Add-Line ""
Add-Line "Write-Host 'AI Link BWS project IDs loaded. BWS_ACCESS_TOKEN was not set.'"
Add-Line "Write-Host 'Next: npm run bws:session'"

$content = ($lines -join [Environment]::NewLine) + [Environment]::NewLine

if ($Print) {
  Write-Output $content
  if (-not $hasProjectId -or -not $hasCiProjectId) {
    Write-Host "BWS local profile is missing one or more project IDs; pass -ProjectId/-CiProjectId or use -ResolveFromBws after authentication."
  }
  exit 0
}

$resolvedOutputPath = Resolve-RepoPath $OutputPath
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resolvedOutputPath) | Out-Null
Set-Content -LiteralPath $resolvedOutputPath -Value $content -Encoding UTF8
Write-Host "BWS local project profile written to $OutputPath"
if (-not $hasProjectId -or -not $hasCiProjectId) {
  Write-Host "Profile contains commented placeholders for missing project IDs."
}
