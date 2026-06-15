param(
  [string]$ManifestPath = ".ai-link/bitwarden-secrets.manifest.json",
  [string]$OutputPath = "runtime/tmp/bws-rotation-plan.md",
  [int]$TokenLifetimeDays = 90,
  [int]$ReviewLeadDays = 15,
  [string]$TokenCreatedDate = "",
  [switch]$Force,
  [switch]$Print,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

function Show-Help {
  Write-Host @"
BWS rotation plan

Usage:
  powershell -ExecutionPolicy Bypass -File tools/new-bws-rotation-plan.ps1
  powershell -ExecutionPolicy Bypass -File tools/new-bws-rotation-plan.ps1 -Print
  powershell -ExecutionPolicy Bypass -File tools/new-bws-rotation-plan.ps1 -TokenCreatedDate 2026-06-15

Default:
  Writes a non-secret rotation plan to:

    runtime/tmp/bws-rotation-plan.md

Safety:
  - This command never accepts or prints token values.
  - Record only creation dates, review dates, command names, and evidence links.
  - Token values stay only in Bitwarden, local session prompts, or GitHub Environment Secrets.
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

function Format-Date {
  param([DateTime]$Value)
  return $Value.ToString("yyyy-MM-dd")
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

if ($TokenLifetimeDays -lt 1) {
  Fail "TokenLifetimeDays must be greater than 0."
}

if ($ReviewLeadDays -lt 1) {
  $ReviewLeadDays = 15
}

if ($ReviewLeadDays -ge $TokenLifetimeDays) {
  $ReviewLeadDays = [Math]::Max(1, [Math]::Floor($TokenLifetimeDays / 2))
}

if (-not $Print -and -not (Test-RuntimeTmpTarget $OutputPath)) {
  Fail "Refusing to write BWS rotation plan outside runtime/tmp."
}

if (-not $Print -and (Test-Path -LiteralPath $OutputPath) -and -not $Force) {
  Fail "Output file already exists: $OutputPath. Pass -Force to overwrite."
}

$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $ManifestPath | ConvertFrom-Json
$hasCreatedDate = -not [string]::IsNullOrWhiteSpace($TokenCreatedDate)
$createdAt = $null
if ($hasCreatedDate) {
  try {
    $createdAt = ([DateTimeOffset]::Parse($TokenCreatedDate)).Date
  } catch {
    Fail "TokenCreatedDate must be parseable, for example 2026-06-15."
  }
}

$lines = New-Object System.Collections.Generic.List[string]
function Add-Line {
  param([string]$Line = "")
  $lines.Add($Line) | Out-Null
}

$reviewOffsetDays = $TokenLifetimeDays - $ReviewLeadDays

Add-Line "# BWS Rotation Plan"
Add-Line ""
Add-Line ("Generated: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz"))
Add-Line ""
Add-Line "Generated from ``$ManifestPath``."
Add-Line ""
Add-Line "Safety:"
Add-Line "- Do not write token values in this plan, Git, docs, issue text, pull requests, screenshots, or knowledge-base mirrors."
Add-Line "- Store only token creation dates, review dates, and evidence links."
Add-Line "- ``BWS_ACCESS_TOKEN`` belongs only in local session prompts; ``BW_ACCESS_TOKEN`` belongs only in the GitHub Environment Secret."
Add-Line "- Rotate immediately after suspected exposure, lost device access, role changes, or accidental copy into any unsafe place."
Add-Line ""
Add-Line "Token cadence:"
Add-Line "- Target machine-account token lifetime: $TokenLifetimeDays days."
Add-Line "- Review window starts $ReviewLeadDays days before expiry."
Add-Line "- Start review on day $reviewOffsetDays after creation."
Add-Line ""

Add-Line "## Machine account schedule"
Add-Line ""
Add-Line "| Project | Machine account | Created date | Review from | Rotate by |"
Add-Line "| --- | --- | --- | --- | --- |"
foreach ($projectEntry in $manifest.projects.PSObject.Properties) {
  $project = $projectEntry.Value
  if ($hasCreatedDate) {
    $reviewDate = Format-Date ($createdAt.AddDays($reviewOffsetDays))
    $rotateBy = Format-Date ($createdAt.AddDays($TokenLifetimeDays))
    $createdLabel = Format-Date $createdAt
  } else {
    $createdLabel = "``yyyy-mm-dd``"
    $reviewDate = "``created + $reviewOffsetDays days``"
    $rotateBy = "``created + $TokenLifetimeDays days``"
  }
  Add-Line "| ``$($project.name)`` | ``$($project.machineAccount)`` | $createdLabel | $reviewDate | $rotateBy |"
}
Add-Line ""

Add-Line "## Rotation runbook"
Add-Line ""
foreach ($projectEntry in $manifest.projects.PSObject.Properties) {
  $project = $projectEntry.Value
  Add-Line "### ``$($project.machineAccount)``"
  Add-Line ""
  Add-Line "- Project: ``$($project.name)``"
  Add-Line "- Access: read-only"
  if ($project.githubEnvironmentSecret) {
    Add-Line "- Bootstrap destination: GitHub Environment Secret ``$($project.githubEnvironmentSecret)``"
  } else {
    Add-Line "- Bootstrap destination: local hidden prompt as ``BWS_ACCESS_TOKEN``"
  }
  Add-Line ""
  Add-Line "Steps:"
  Add-Line "1. Create a new Bitwarden Secrets Manager access token for this machine account with a $TokenLifetimeDays day expiry."
  Add-Line "2. Validate the new token before deleting the old token."
  if ($project.githubEnvironmentSecret) {
    Add-Line "3. Update GitHub Environment Secret ``$($project.githubEnvironmentSecret)`` in the ``$($manifest.githubEnvironments.providerLive.name)`` environment."
    Add-Line "4. Run ``npm run bws:github-vars`` if any provider secret was recreated and secret IDs may have changed."
    Add-Line "5. Run ``npm run providers:github:check`` locally; run ``npm run providers:github:remote-check`` when ``GH_TOKEN`` or ``GITHUB_TOKEN`` can read repository environments."
    Add-Line "6. Delete or disable the old Bitwarden access token after checks pass."
  } else {
    Add-Line "3. Run ``npm run bws:session`` or ``npm run bws:activate -- -SkipCi`` in a fresh local session."
    Add-Line "4. Run ``npm run bws:run -- -CommandLine `"npm run ai-link -- doctor`"`` or ``npm run bws:doctor`` after strict readiness passes."
    Add-Line "5. Delete or disable the old Bitwarden access token after checks pass."
  }
  Add-Line ""
}

Add-Line "## Secret value rotation"
Add-Line ""
Add-Line "- Provider API keys: rotate in the provider portal first, update the existing Bitwarden secret value, then run ``npm run bws:run -- -CommandLine `"npm run ai-link -- doctor`"`` or ``npm run bws:doctor``."
Add-Line "- Auth Hub tokens and passwords: generate replacements with ``npm run auth-hub:secrets:new``, update Bitwarden, then restart or redeploy the service that consumes them."
Add-Line "- GitHub provider-live variables: update only when a Bitwarden secret is recreated and its secret ID changes; editing a secret value should not require changing the secret ID variable."
Add-Line "- Database and SMTP URLs: rotate with the upstream service first, then update Bitwarden and the deployment environment."
Add-Line ""

Add-Line "## Evidence checklist"
Add-Line ""
Add-Line "- [ ] ``npm run bws:acceptance:json`` renders the current non-secret acceptance state for handoff."
Add-Line "- [ ] ``npm run bws:acceptance:strict`` passes after Bitwarden and GitHub setup are complete."
Add-Line "- [ ] ``npm run bws:run -- -CommandLine `"npm run ai-link -- doctor`"`` or ``npm run bws:doctor`` confirms local AI Link can read provider keys through ``bws run``."
Add-Line "- [ ] ``npm run providers:github:check`` passes."
Add-Line "- [ ] ``npm run providers:github:remote-check`` passes when remote environment access is available."
Add-Line "- [ ] Provider live workflow is triggered only after model cost boundaries are confirmed."
Add-Line "- [ ] ``npm run security:scan`` passes."
Add-Line "- [ ] ``git status --short --branch`` is clean before handoff."
Add-Line ""

Add-Line "## Emergency rotation"
Add-Line ""
Add-Line "1. Revoke the suspected machine-account token in Bitwarden."
Add-Line "2. Rotate affected provider keys or app tokens in their source systems."
Add-Line "3. Update Bitwarden secret values or GitHub Environment Secret values."
Add-Line "4. Rerun strict BWS acceptance and security scan."
Add-Line "5. Do not paste the exposed value into the incident note; record only the environment variable name and affected system."

$content = ($lines -join [Environment]::NewLine) + [Environment]::NewLine

if ($Print) {
  Write-Output $content
  exit 0
}

$resolvedOutputPath = Resolve-RepoPath $OutputPath
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resolvedOutputPath) | Out-Null
Set-Content -LiteralPath $resolvedOutputPath -Value $content -Encoding UTF8
Write-Host "BWS rotation plan written to $OutputPath"
