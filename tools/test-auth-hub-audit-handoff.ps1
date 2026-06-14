param(
  [string]$BaseUrl = "",
  [string]$AdminToken = "",
  [string]$CodexToken = "",
  [switch]$NoAutoStart,
  [switch]$KeepLocal
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $root "runtime\tmp"
$hubStatePath = Join-Path $runtimeDir "auth-hub-local.json"
$startedLocal = $false

function Read-LocalHubUrl {
  if (-not (Test-Path -LiteralPath $hubStatePath)) {
    return ""
  }
  $state = Get-Content -LiteralPath $hubStatePath -Raw | ConvertFrom-Json
  return [string]$state.url
}

function Invoke-Npm {
  param([string[]]$Arguments)
  Push-Location $root
  try {
    $global:LASTEXITCODE = 0
    $output = & npm @Arguments 2>&1
    $code = $LASTEXITCODE
    if ($code -ne 0) {
      $output | Write-Output
      throw "npm $($Arguments -join ' ') failed with exit code $code"
    }
    return @($output)
  } finally {
    Pop-Location
  }
}

function Invoke-JsonApi {
  param(
    [string]$Uri,
    [string]$Token,
    [string]$Method = "GET",
    [object]$Body = $null
  )

  $parameters = @{
    Uri = $Uri
    Method = $Method
    Headers = @{ Authorization = "Bearer $Token" }
    TimeoutSec = 10
  }

  if ($null -ne $Body) {
    $parameters.ContentType = "application/json"
    $parameters.Body = ($Body | ConvertTo-Json -Depth 12 -Compress)
  }

  return Invoke-RestMethod @parameters
}

if (-not $BaseUrl) {
  $BaseUrl = Read-LocalHubUrl
}

if (-not $BaseUrl -and $env:AI_LINK_BASE_URL) {
  $BaseUrl = $env:AI_LINK_BASE_URL
}

if (-not $BaseUrl -and -not $NoAutoStart) {
  Push-Location $root
  try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "start-auth-hub-local.ps1") | Out-Null
    $startedLocal = $true
  } finally {
    Pop-Location
  }
  $BaseUrl = Read-LocalHubUrl
}

if (-not $BaseUrl) {
  $BaseUrl = "http://127.0.0.1:10001"
}

if (-not $AdminToken) {
  $AdminToken = $env:AI_LINK_ADMIN_TOKEN
}
if (-not $AdminToken) {
  $AdminToken = "dev-admin-token"
}

if (-not $CodexToken) {
  $CodexToken = $env:AI_LINK_CODEX_TOKEN
}
if (-not $CodexToken) {
  $CodexToken = "dev-codex-token"
}

$hadBaseUrl = Test-Path Env:\AI_LINK_BASE_URL
$oldBaseUrl = $env:AI_LINK_BASE_URL
$hadCodexToken = Test-Path Env:\AI_LINK_CODEX_TOKEN
$oldCodexToken = $env:AI_LINK_CODEX_TOKEN

try {
  $health = Invoke-RestMethod -Uri ($BaseUrl.TrimEnd("/") + "/healthz") -TimeoutSec 10
  if (-not $health.ok) {
    throw "Health check failed"
  }

  $task = Invoke-JsonApi `
    -Uri ($BaseUrl.TrimEnd("/") + "/api/tasks") `
    -Token $AdminToken `
    -Method "POST" `
    -Body @{
      workflow = "read_detect"
      input = @{
        title = "audit handoff smoke"
        text = "public smoke-test text for AI Link audit handoff"
      }
    }

  $taskId = [string]$task.task.id
  if (-not $taskId) {
    throw "Task creation did not return task id"
  }

  $env:AI_LINK_BASE_URL = $BaseUrl.TrimEnd("/")
  $env:AI_LINK_CODEX_TOKEN = $CodexToken

  Invoke-Npm @("run", "ai-link", "--", "workflow", "run", "auto_ops", "--dry-run", "--stages", "research", "--input", "public audit handoff smoke", "--record") | Out-Null
  Invoke-Npm @("run", "ai-link", "--", "runs", "submit-audit", "latest", "--task-id", $taskId, "--base-url", $BaseUrl.TrimEnd("/")) | Out-Null

  $audit = Invoke-JsonApi `
    -Uri ($BaseUrl.TrimEnd("/") + "/api/audit?taskId=$taskId&eventType=ai_link.audit") `
    -Token $AdminToken

  $events = @($audit.auditEvents)
  if ($events.Count -lt 1) {
    throw "No ai_link.audit event found for task $taskId"
  }

  $event = $events | Select-Object -First 1
  $auditSummary = $event.detail.audit
  $firstStage = $null
  if ($auditSummary.stages) {
    $firstStage = @($auditSummary.stages) | Select-Object -First 1
  }
  $runAudit = if ($firstStage) { $firstStage.result } else { $auditSummary }

  if ($runAudit.provider -ne "grok") {
    throw "Audit provider is $($runAudit.provider), expected grok"
  }

  $serialized = $audit | ConvertTo-Json -Depth 20 -Compress
  if ($serialized -match "public audit handoff smoke") {
    throw "Audit response includes raw input text"
  }

  [ordered]@{
    ok = $true
    baseUrl = $BaseUrl.TrimEnd("/")
    taskId = $taskId
    auditEventId = $event.id
    recordId = $event.detail.recordId
    provider = $runAudit.provider
    model = $runAudit.model
    eventType = $event.eventType
  } | ConvertTo-Json -Compress -Depth 8
} finally {
  if ($hadBaseUrl) {
    $env:AI_LINK_BASE_URL = $oldBaseUrl
  } else {
    Remove-Item Env:\AI_LINK_BASE_URL -ErrorAction SilentlyContinue
  }

  if ($hadCodexToken) {
    $env:AI_LINK_CODEX_TOKEN = $oldCodexToken
  } else {
    Remove-Item Env:\AI_LINK_CODEX_TOKEN -ErrorAction SilentlyContinue
  }

  if ($startedLocal -and -not $KeepLocal) {
    Push-Location $root
    try {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "stop-auth-hub-local.ps1") | Out-Null
    } finally {
      Pop-Location
    }
  }
}
