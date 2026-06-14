param(
  [switch]$Production,
  [string]$BaseUrl = "",
  [string]$RenderYaml = "render.yaml"
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$renderPath = Join-Path $root $RenderYaml

$requiredEnv = @(
  "AI_LINK_BASE_URL",
  "AI_LINK_APP_PASSWORD",
  "AI_LINK_SESSION_SECRET",
  "AI_LINK_ADMIN_TOKEN",
  "AI_LINK_EXECUTOR_TOKEN"
)

$optionalEnv = @(
  "AI_LINK_CODEX_TOKEN",
  "DATABASE_URL",
  "SMTP_URL",
  "APPROVAL_EMAIL_TO",
  "APPROVAL_EMAIL_FROM"
)

$weakValues = @(
  "dev-password",
  "dev-session-secret",
  "dev-admin-token",
  "dev-executor-token",
  "dev-codex-token",
  "replace-with-local-password",
  "replace-with-long-random-session-secret",
  "replace-with-admin-token",
  "replace-with-executor-token",
  "replace-with-codex-token"
)

function Add-Result {
  param(
    [System.Collections.Generic.List[object]]$Results,
    [string]$Name,
    [string]$Status,
    [string]$Detail
  )

  $Results.Add([ordered]@{
    name = $Name
    status = $Status
    detail = $Detail
  }) | Out-Null
}

function Get-EnvValue {
  param([string]$Name)
  return [Environment]::GetEnvironmentVariable($Name, "Process")
}

$results = New-Object System.Collections.Generic.List[object]

if (Test-Path -LiteralPath $renderPath) {
  Add-Result $results "render.yaml" "pass" "Render blueprint file exists."
  $renderText = Get-Content -LiteralPath $renderPath -Raw
  foreach ($name in @("AI_LINK_BASE_URL", "DATABASE_URL", "AI_LINK_APP_PASSWORD", "AI_LINK_SESSION_SECRET", "AI_LINK_ADMIN_TOKEN", "AI_LINK_EXECUTOR_TOKEN")) {
    if ($renderText -match [regex]::Escape($name)) {
      Add-Result $results "render env $name" "pass" "Referenced by render.yaml."
    } else {
      Add-Result $results "render env $name" "fail" "Missing from render.yaml."
    }
  }
  if ($renderText -match "healthCheckPath:\s*/healthz") {
    Add-Result $results "Render health check" "pass" "healthCheckPath points to /healthz."
  } else {
    Add-Result $results "Render health check" "fail" "healthCheckPath should point to /healthz."
  }
} else {
  Add-Result $results "render.yaml" "fail" "Render blueprint file is missing."
}

foreach ($name in $requiredEnv) {
  $value = Get-EnvValue $name
  if (-not $value) {
    $status = if ($Production) { "fail" } else { "warn" }
    Add-Result $results "env $name" $status "Not set in current process."
    continue
  }

  if ($weakValues -contains $value) {
    $status = if ($Production) { "fail" } else { "warn" }
    Add-Result $results "env $name" $status "Set, but value is a known development placeholder."
    continue
  }

  if ($value.Length -lt 24 -and $name -ne "AI_LINK_BASE_URL") {
    $status = if ($Production) { "fail" } else { "warn" }
    Add-Result $results "env $name" $status "Set, but appears short for a production secret."
    continue
  }

  Add-Result $results "env $name" "pass" "Set without exposing value."
}

foreach ($name in $optionalEnv) {
  $value = Get-EnvValue $name
  if ($value) {
    Add-Result $results "optional env $name" "pass" "Set without exposing value."
  } else {
    Add-Result $results "optional env $name" "info" "Not set."
  }
}

$effectiveBaseUrl = $BaseUrl
if (-not $effectiveBaseUrl) {
  $effectiveBaseUrl = Get-EnvValue "AI_LINK_BASE_URL"
}

if ($effectiveBaseUrl) {
  if ($Production -and -not $effectiveBaseUrl.StartsWith("https://")) {
    Add-Result $results "base url scheme" "fail" "Production base URL must use HTTPS."
  } else {
    Add-Result $results "base url scheme" "pass" "Base URL scheme is acceptable for this mode."
  }

  if ($Production -and $effectiveBaseUrl -notmatch "voice\.xiao-qi-ai\.com") {
    Add-Result $results "base url host" "warn" "Production target is not voice.xiao-qi-ai.com."
  } else {
    Add-Result $results "base url host" "pass" "Base URL host matches expected deployment mode."
  }
} else {
  Add-Result $results "base url" "warn" "No BaseUrl parameter or AI_LINK_BASE_URL found."
}

if ($Production) {
  $accessFlag = Get-EnvValue "AI_LINK_CLOUDFLARE_ACCESS_ENABLED"
  if ($accessFlag -eq "1" -or $accessFlag -eq "true") {
    Add-Result $results "Cloudflare Access" "pass" "Marked enabled by AI_LINK_CLOUDFLARE_ACCESS_ENABLED."
  } else {
    Add-Result $results "Cloudflare Access" "warn" "Cannot verify Cloudflare Access from local env; set AI_LINK_CLOUDFLARE_ACCESS_ENABLED=1 after manual verification."
  }
}

$failed = @($results | Where-Object { $_.status -eq "fail" })
$warnings = @($results | Where-Object { $_.status -eq "warn" })
$summary = [ordered]@{
  ok = $failed.Count -eq 0
  mode = if ($Production) { "production" } else { "local" }
  failed = $failed.Count
  warnings = $warnings.Count
  results = $results
}

$summary | ConvertTo-Json -Depth 6

if ($failed.Count -gt 0) {
  exit 1
}
