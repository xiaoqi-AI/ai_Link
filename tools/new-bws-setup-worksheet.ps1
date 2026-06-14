param(
  [string]$ManifestPath = ".ai-link/bitwarden-secrets.manifest.json",
  [string]$OutputPath = "runtime/tmp/bws-setup-worksheet.md",
  [switch]$Force,
  [switch]$Print
)

$ErrorActionPreference = "Stop"

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

if (-not (Test-Path -LiteralPath $ManifestPath)) {
  Fail "Manifest not found: $ManifestPath"
}

if (-not $Print -and -not (Test-RuntimeTmpTarget $OutputPath)) {
  Fail "Refusing to write BWS setup worksheet outside runtime/tmp."
}

if (-not $Print -and (Test-Path -LiteralPath $OutputPath) -and -not $Force) {
  Fail "Output file already exists: $OutputPath. Pass -Force to overwrite."
}

$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $ManifestPath | ConvertFrom-Json
$lines = New-Object System.Collections.Generic.List[string]

function Add-Line {
  param([string]$Line = "")
  $lines.Add($Line) | Out-Null
}

Add-Line "# BWS Setup Worksheet"
Add-Line ""
Add-Line "Generated from ``$ManifestPath``."
Add-Line ""
Add-Line "Safety rules:"
foreach ($rule in @($manifest.rules)) {
  Add-Line "- $rule"
}
Add-Line "- Do not type secret values in this worksheet. Put secret values only in Bitwarden or GitHub Environment Secrets."
Add-Line "- This file is intended for ``runtime/tmp`` and must not be committed."
Add-Line ""
Add-Line "## Bitwarden Password Manager folders"
Add-Line ""
foreach ($folder in @("AI Accounts", "API Portals", "Private Links", "Recovery Codes")) {
  Add-Line "- [ ] $folder"
}
Add-Line ""
Add-Line "## Bitwarden Secrets Manager"
Add-Line ""
Add-Line "- Organization: ``$($manifest.organization)``"
Add-Line ""

foreach ($projectEntry in $manifest.projects.PSObject.Properties) {
  $project = $projectEntry.Value
  Add-Line "### Project: ``$($project.name)``"
  Add-Line ""
  Add-Line "- Manifest key: ``$($projectEntry.Name)``"
  Add-Line "- Machine account: ``$($project.machineAccount)``"
  Add-Line "- Access: read-only"
  if ($project.githubEnvironmentSecret) {
    Add-Line "- GitHub bootstrap secret: ``$($project.githubEnvironmentSecret)``"
  }
  Add-Line ""
  Add-Line "| Secret key | Created in Bitwarden? | Notes |"
  Add-Line "| --- | --- | --- |"
  foreach ($secretKey in @($project.expectedSecretKeys)) {
    Add-Line "| ``$secretKey`` | [ ] | |"
  }
  Add-Line ""
}

Add-Line "## GitHub Environments"
Add-Line ""
foreach ($environmentEntry in $manifest.githubEnvironments.PSObject.Properties) {
  $environment = $environmentEntry.Value
  Add-Line "### Environment: ``$($environment.name)``"
  Add-Line ""
  Add-Line "- Machine account: ``$($environment.machineAccount)``"
  Add-Line "- Environment secret: ``$($environment.bootstrapSecret)`` = machine account access token"
  Add-Line ""
  Add-Line "| Bitwarden secret key | GitHub Environment variable | Value to paste |"
  Add-Line "| --- | --- | --- |"
  foreach ($secretVariable in $environment.secretIdVariables.PSObject.Properties) {
    Add-Line "| ``$($secretVariable.Name)`` | ``$($secretVariable.Value)`` | Bitwarden secret ID only |"
  }
  Add-Line ""
}

Add-Line "## Local validation"
Add-Line ""
Add-Line "Run these after Bitwarden is configured:"
Add-Line ""
Add-Line '```powershell'
Add-Line '$env:AI_LINK_BWS_PROJECT_ID="<ai-link-local-dev-project-id>"'
Add-Line '$env:AI_LINK_BWS_CI_PROJECT_ID="<ai-link-ci-project-id>"'
Add-Line 'npm run bws:session'
Add-Line 'npm run bws:doctor'
Add-Line 'npm run bws:github-vars'
Add-Line 'npm run bws:github-vars:apply-plan'
Add-Line 'npm run bws:acceptance'
Add-Line '```'
Add-Line ""
Add-Line "If current-session BWS and GitHub tokens are available, apply non-secret GitHub variables with:"
Add-Line ""
Add-Line '```powershell'
Add-Line 'npm run bws:github-vars:apply'
Add-Line '```'
Add-Line ""
Add-Line "Set the GitHub Environment Secret manually:"
Add-Line ""
Add-Line '```text'
Add-Line 'BW_ACCESS_TOKEN = <ma-ai-link-github-actions-token>'
Add-Line '```'
Add-Line ""
Add-Line "Run these after GitHub provider-live is configured:"
Add-Line ""
Add-Line '```powershell'
Add-Line 'npm run providers:github:check'
Add-Line 'npm run providers:github:remote-check'
Add-Line 'npm run bws:acceptance:strict'
Add-Line '```'

$content = ($lines -join [Environment]::NewLine) + [Environment]::NewLine

if ($Print) {
  Write-Output $content
  exit 0
}

$resolvedOutputPath = Resolve-RepoPath $OutputPath
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resolvedOutputPath) | Out-Null
Set-Content -LiteralPath $resolvedOutputPath -Value $content -Encoding UTF8
Write-Host "BWS setup worksheet written to $OutputPath"
