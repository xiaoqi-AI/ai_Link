param(
  [string]$ManifestPath = ".ai-link/bitwarden-secrets.manifest.json",
  [string]$OutputPath = "runtime/tmp/bws-onboarding.md",
  [string]$ProjectId = $env:AI_LINK_BWS_PROJECT_ID,
  [string]$CiProjectId = $env:AI_LINK_BWS_CI_PROJECT_ID,
  [switch]$Force,
  [switch]$Print,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

function Show-Help {
  Write-Host @"
BWS onboarding runbook

Usage:
  powershell -ExecutionPolicy Bypass -File tools/start-bws-onboarding.ps1 [-Print]

Default:
  Writes a non-secret onboarding runbook to:

    runtime/tmp/bws-onboarding.md

Examples:
  npm run bws:onboard
  npm run bws:onboard:print

Safety:
  - This command never prints secret values.
  - Bootstrap tokens are reported only as present or missing.
  - Generated files are limited to runtime/tmp.
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

function Invoke-Capture {
  param([scriptblock]$Command)
  $global:LASTEXITCODE = 0
  $output = ""
  try {
    $output = (& $Command 2>&1 | Out-String).Trim()
    $code = if ($null -ne $global:LASTEXITCODE) { [int]$global:LASTEXITCODE } else { 0 }
  } catch {
    $output = $_.Exception.Message
    $code = 1
  }

  return [ordered]@{
    code = $code
    output = $output
  }
}

function Add-Status {
  param([string]$Name, [string]$Status, [string]$Detail)
  $script:statuses.Add([ordered]@{
    name = $Name
    status = $Status
    detail = $Detail
  }) | Out-Null
}

function Add-Action {
  param([string]$Action)
  $script:actions.Add($Action) | Out-Null
}

function Escape-MarkdownCell {
  param([string]$Value)
  if ($null -eq $Value) {
    return ""
  }
  return $Value.Replace("|", "\|").Replace([string][char]0x60, "'")
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
  Fail "Refusing to write BWS onboarding runbook outside runtime/tmp."
}

if (-not $Print -and (Test-Path -LiteralPath $OutputPath) -and -not $Force) {
  Fail "Output file already exists: $OutputPath. Pass -Force to overwrite."
}

$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $ManifestPath | ConvertFrom-Json
$statuses = New-Object System.Collections.Generic.List[object]
$actions = New-Object System.Collections.Generic.List[string]

$bwsPath = Resolve-BwsPath
if ($bwsPath) {
  $versionResult = Invoke-Capture { & $bwsPath --version }
  $version = if ($versionResult.output) { $versionResult.output } else { "available" }
  Add-Status "bws CLI" "ready" $version
} else {
  Add-Status "bws CLI" "missing" "install Bitwarden Secrets Manager CLI"
  Add-Action "Install Bitwarden Secrets Manager CLI, then rerun ``npm run bws:onboard``."
}

if ([string]::IsNullOrWhiteSpace($ProjectId)) {
  Add-Status "AI_LINK_BWS_PROJECT_ID" "missing" "set the non-sensitive local-dev project id"
  Add-Action "Create or open the Bitwarden project ``$($manifest.projects.localDev.name)``, then set ``AI_LINK_BWS_PROJECT_ID`` in the current local session."
} else {
  Add-Status "AI_LINK_BWS_PROJECT_ID" "ready" "present; value not printed"
}

if ([string]::IsNullOrWhiteSpace($CiProjectId)) {
  Add-Status "AI_LINK_BWS_CI_PROJECT_ID" "missing" "set the non-sensitive CI project id"
  Add-Action "Create or open the Bitwarden project ``$($manifest.projects.ci.name)``, then set ``AI_LINK_BWS_CI_PROJECT_ID`` in the current local session."
} else {
  Add-Status "AI_LINK_BWS_CI_PROJECT_ID" "ready" "present; value not printed"
}

if ([string]::IsNullOrWhiteSpace($env:BWS_ACCESS_TOKEN)) {
  Add-Status "BWS_ACCESS_TOKEN" "missing" "only enter it through a local session prompt or temporary environment"
  Add-Action "Run ``npm run bws:session`` when you are ready to paste the local machine-account token into a hidden prompt."
} else {
  Add-Status "BWS_ACCESS_TOKEN" "ready" "present in current session; value not printed"
}

if ($env:GH_TOKEN -or $env:GITHUB_TOKEN) {
  Add-Status "GitHub API token" "ready" "present in current session; value not printed"
} else {
  Add-Status "GitHub API token" "optional" "needed only for remote GitHub Environment name checks"
}

$gitStatus = Invoke-Capture { & git status --short --branch --untracked-files=all }
if ($gitStatus.code -eq 0) {
  $statusLines = @($gitStatus.output -split "`r?`n" | Where-Object { $_ })
  $dirtyLines = @($statusLines | Where-Object { $_ -notmatch "^\#\# " })
  if ($dirtyLines.Count -eq 0) {
    Add-Status "Git working tree" "ready" "clean"
  } else {
    Add-Status "Git working tree" "review" "$($dirtyLines.Count) pending change(s); inspect before commit or handoff"
  }
} else {
  Add-Status "Git working tree" "unknown" "could not read git status"
}

if ($bwsPath -and -not [string]::IsNullOrWhiteSpace($ProjectId) -and -not [string]::IsNullOrWhiteSpace($env:BWS_ACCESS_TOKEN)) {
  Add-Action "Run ``npm run bws:check:strict`` to verify local Bitwarden project access and expected secret keys."
}

if ($bwsPath -and -not [string]::IsNullOrWhiteSpace($CiProjectId) -and -not [string]::IsNullOrWhiteSpace($env:BWS_ACCESS_TOKEN)) {
  Add-Action "Run ``npm run bws:github-vars`` to produce the GitHub provider-live variable worksheet from Bitwarden secret IDs."
}

if (-not [string]::IsNullOrWhiteSpace($ProjectId) -or -not [string]::IsNullOrWhiteSpace($CiProjectId)) {
  Add-Action "Run ``npm run bws:profile`` to create an ignored local PowerShell snippet for the non-secret project IDs."
} elseif ($bwsPath -and -not [string]::IsNullOrWhiteSpace($env:BWS_ACCESS_TOKEN)) {
  Add-Action "Run ``npm run bws:profile:from-bws`` to read Bitwarden project IDs by manifest project name and write a local profile snippet."
} else {
  Add-Action "Run ``npm run bws:profile:print`` to preview the local project ID profile snippet."
}

Add-Action "Run ``npm run bws:acceptance`` for a non-secret progress report; use ``npm run bws:acceptance:strict`` only after Bitwarden and GitHub are configured."
Add-Action "Keep provider live verification disabled until model cost boundaries are confirmed."

$lines = New-Object System.Collections.Generic.List[string]
function Add-Line {
  param([string]$Line = "")
  $lines.Add($Line) | Out-Null
}

Add-Line "# BWS Onboarding Runbook"
Add-Line ""
Add-Line ("Generated: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz"))
Add-Line ""
Add-Line "Purpose: one safe entry page for entering BWS-managed secret mode."
Add-Line ""
Add-Line "Safety:"
foreach ($rule in @($manifest.rules)) {
  Add-Line "- $rule"
}
Add-Line "- Do not type secret values into this runbook."
Add-Line "- Generated onboarding files belong in ``runtime/tmp`` and must not be committed."
Add-Line ""
Add-Line "## Current status"
Add-Line ""
Add-Line "| Check | Status | Detail |"
Add-Line "| --- | --- | --- |"
foreach ($status in $statuses) {
  Add-Line ("| ``{0}`` | ``{1}`` | {2} |" -f (Escape-MarkdownCell $status.name), (Escape-MarkdownCell $status.status), (Escape-MarkdownCell $status.detail))
}
Add-Line ""
Add-Line "## Target structure"
Add-Line ""
Add-Line "- Organization: ``$($manifest.organization)``"
Add-Line ""
foreach ($projectEntry in $manifest.projects.PSObject.Properties) {
  $project = $projectEntry.Value
  Add-Line "### Bitwarden project: ``$($project.name)``"
  Add-Line ""
  Add-Line "- Manifest key: ``$($projectEntry.Name)``"
  Add-Line "- Machine account: ``$($project.machineAccount)``"
  Add-Line "- Machine account access: read-only"
  if ($project.githubEnvironmentSecret) {
    Add-Line "- GitHub bootstrap secret: ``$($project.githubEnvironmentSecret)``"
  }
  Add-Line "- Expected secret keys:"
  foreach ($secretKey in @($project.expectedSecretKeys)) {
    Add-Line "  - ``$secretKey``"
  }
  Add-Line ""
}
Add-Line "## GitHub provider-live Environment"
Add-Line ""
foreach ($environmentEntry in $manifest.githubEnvironments.PSObject.Properties) {
  $environment = $environmentEntry.Value
  Add-Line "- Environment: ``$($environment.name)``"
  Add-Line "- Bootstrap secret: ``$($environment.bootstrapSecret)``"
  Add-Line "- Secret ID variables:"
  foreach ($secretVariable in $environment.secretIdVariables.PSObject.Properties) {
    Add-Line "  - ``$($secretVariable.Value)`` for ``$($secretVariable.Name)``"
  }
  Add-Line ""
}
Add-Line "## Recommended next actions"
Add-Line ""
foreach ($action in $actions) {
  Add-Line "- $action"
}
Add-Line ""
Add-Line "## Useful commands"
Add-Line ""
Add-Line '```powershell'
Add-Line 'npm run bws:plan'
Add-Line 'npm run bws:profile:print'
Add-Line 'npm run bws:worksheet'
Add-Line 'npm run bws:session'
Add-Line 'npm run bws:doctor'
Add-Line 'npm run bws:github-vars'
Add-Line 'npm run bws:acceptance'
Add-Line '```'

$content = ($lines -join [Environment]::NewLine) + [Environment]::NewLine

if ($Print) {
  Write-Output $content
  exit 0
}

$resolvedOutputPath = Resolve-RepoPath $OutputPath
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resolvedOutputPath) | Out-Null
Set-Content -LiteralPath $resolvedOutputPath -Value $content -Encoding UTF8
Write-Host "BWS onboarding runbook written to $OutputPath"
