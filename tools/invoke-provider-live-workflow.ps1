param(
  [string]$Repository = "xiaoqi-AI/ai_Link",
  [string]$WorkflowFile = "provider-live.yml",
  [string]$Ref = "main",
  [string]$ManifestPath = ".ai-link/bitwarden-secrets.manifest.json",
  [string]$EnvironmentKey = "providerLive",
  [string]$GitHubToken = "",
  [switch]$Strict,
  [switch]$Dispatch,
  [switch]$AcknowledgeCost,
  [switch]$Plan,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

function Show-Help {
  Write-Host @"
Provider live workflow dispatcher

Usage:
  powershell -ExecutionPolicy Bypass -File tools/invoke-provider-live-workflow.ps1 -Plan
  powershell -ExecutionPolicy Bypass -File tools/invoke-provider-live-workflow.ps1 -Dispatch -AcknowledgeCost
  powershell -ExecutionPolicy Bypass -File tools/invoke-provider-live-workflow.ps1 -Dispatch -AcknowledgeCost -Strict

Default:
  Prints a non-secret plan. Nothing is dispatched unless -Dispatch is passed.

Dispatch mode:
  Triggers the GitHub Actions workflow_dispatch event for Provider Live Verification.
  This can call real providers and may create external model costs.

Required for -Dispatch:
  - GH_TOKEN, GITHUB_TOKEN, or -GitHubToken with workflow dispatch permission.
  - -AcknowledgeCost to confirm live provider verification is intentional.

Safety:
  - This command never accepts or prints provider API keys.
  - It does not read or write Bitwarden secrets.
  - It only dispatches the existing GitHub workflow after explicit confirmation.
"@
}

function Fail($message) {
  Write-Error $message
  exit 1
}

function Get-GitHubToken {
  if ($GitHubToken) {
    return $GitHubToken
  }
  if ($env:GH_TOKEN) {
    return $env:GH_TOKEN
  }
  if ($env:GITHUB_TOKEN) {
    return $env:GITHUB_TOKEN
  }
  return ""
}

function New-GitHubHeaders {
  param([string]$Token)
  $headers = @{
    "Accept" = "application/vnd.github+json"
    "User-Agent" = "ai-link-provider-live-dispatch"
    "X-GitHub-Api-Version" = "2022-11-28"
  }
  if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
  }
  return $headers
}

function Invoke-GitHubJson {
  param(
    [string]$Path,
    [string]$Token
  )
  return Invoke-RestMethod -Method Get -Uri "https://api.github.com$Path" -Headers (New-GitHubHeaders -Token $Token)
}

function Invoke-GitHubDispatch {
  param(
    [string]$Path,
    [string]$Token,
    [object]$Body
  )

  return Invoke-WebRequest `
    -Method Post `
    -Uri "https://api.github.com$Path" `
    -Headers (New-GitHubHeaders -Token $Token) `
    -ContentType "application/json" `
    -Body ($Body | ConvertTo-Json -Depth 8 -Compress)
}

function Resolve-EnvironmentName {
  if (-not (Test-Path -LiteralPath $ManifestPath)) {
    return ""
  }
  try {
    $manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $ManifestPath | ConvertFrom-Json
    $environment = $manifest.githubEnvironments.$EnvironmentKey
    if ($environment) {
      return [string]$environment.name
    }
  } catch {
    return ""
  }
  return ""
}

if ($Help) {
  Show-Help
  exit 0
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

$environmentName = Resolve-EnvironmentName
$strictInput = if ($Strict) { "true" } else { "false" }
$actionsUrl = "https://github.com/$Repository/actions/workflows/$WorkflowFile"

if ($Plan -or -not $Dispatch) {
  Write-Host "Provider live workflow dispatch plan"
  Write-Host ""
  Write-Host "Repository: $Repository"
  Write-Host "Workflow: $WorkflowFile"
  Write-Host "Ref: $Ref"
  if ($environmentName) {
    Write-Host "GitHub Environment: $environmentName"
  }
  Write-Host "Strict input: $strictInput"
  Write-Host ""
  Write-Host "Safety gates:"
  Write-Host "- Nothing is dispatched by this plan output."
  Write-Host "- Dispatch requires -Dispatch and -AcknowledgeCost."
  Write-Host "- Live provider verification may call external providers and may create model costs."
  Write-Host "- Provider API keys remain in Bitwarden and are injected by the GitHub workflow."
  Write-Host ""
  Write-Host "Before dispatch:"
  Write-Host "- Run npm run providers:github:remote-check."
  Write-Host "- Run npm run bws:acceptance:strict."
  Write-Host "- Confirm model cost boundaries."
  Write-Host ""
  Write-Host "Actions page: $actionsUrl"
  exit 0
}

if (-not $AcknowledgeCost) {
  Fail "Refusing to dispatch provider-live workflow without -AcknowledgeCost."
}

$token = Get-GitHubToken
if ([string]::IsNullOrWhiteSpace($token)) {
  Fail "Missing GitHub token. Set GH_TOKEN/GITHUB_TOKEN only in the current session or pass -GitHubToken."
}

$workflowPath = "/repos/$Repository/actions/workflows/$WorkflowFile/dispatches"
$body = [ordered]@{
  ref = $Ref
  inputs = [ordered]@{
    strict = $strictInput
  }
}

try {
  $response = Invoke-GitHubDispatch -Path $workflowPath -Token $token -Body $body
  if ($response.StatusCode -ne 204) {
    Fail "GitHub workflow dispatch returned HTTP $($response.StatusCode)."
  }
} catch {
  Fail "Could not dispatch $WorkflowFile in $Repository. Check token permissions and workflow file name."
}

Start-Sleep -Seconds 3
$latestRun = $null
try {
  $encodedRef = [uri]::EscapeDataString($Ref)
  $runs = Invoke-GitHubJson -Path "/repos/$Repository/actions/runs?branch=$encodedRef&event=workflow_dispatch&per_page=10" -Token $token
  $latestRun = @($runs.workflow_runs | Where-Object { $_.path -like "*$WorkflowFile" } | Select-Object -First 1)
} catch {
  $latestRun = $null
}

$summary = [ordered]@{
  ok = $true
  repository = $Repository
  workflow = $WorkflowFile
  ref = $Ref
  strict = [bool]$Strict
  dispatched = $true
  action = "provider live verification may create external model costs"
  actionsUrl = $actionsUrl
}

if ($latestRun) {
  $summary["runUrl"] = [string]$latestRun.html_url
  $summary["runStatus"] = [string]$latestRun.status
}

$summary | ConvertTo-Json -Depth 6
