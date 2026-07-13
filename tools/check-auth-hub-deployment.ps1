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
  "DATABASE_URL",
  "AI_LINK_APP_PASSWORD",
  "AI_LINK_SESSION_SECRET",
  "AI_LINK_ADMIN_TOKEN",
  "AI_LINK_EXECUTOR_TOKEN",
  "AI_LINK_EXECUTOR_ID",
  "AI_LINK_CODEX_TOKEN"
)

$optionalEnv = @(
  "SMTP_URL",
  "APPROVAL_EMAIL_TO",
  "APPROVAL_EMAIL_FROM",
  "AI_LINK_SESSION_MAX_AGE_SECONDS",
  "AI_LINK_CSRF_TOKEN_TTL_SECONDS",
  "AI_LINK_LOGIN_MAX_FAILURES",
  "AI_LINK_LOGIN_WINDOW_SECONDS",
  "AI_LINK_LOGIN_BLOCK_SECONDS",
  "AI_LINK_LOGIN_MAX_KEYS",
  "AI_LINK_ALLOWED_ACCESS_EMAILS",
  "AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN",
  "AI_LINK_CLOUDFLARE_ACCESS_ISSUER",
  "AI_LINK_CLOUDFLARE_TEAM_DOMAIN"
)

$requiredProductionAccessEnv = @(
  "AI_LINK_REQUIRE_CLOUDFLARE_ACCESS",
  "AI_LINK_CLOUDFLARE_ACCESS_AUD"
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
  "replace-with-executor-id",
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
  foreach ($name in @(
    "AI_LINK_BASE_URL",
    "DATABASE_URL",
    "AI_LINK_APP_PASSWORD",
    "AI_LINK_SESSION_SECRET",
    "AI_LINK_SESSION_MAX_AGE_SECONDS",
    "AI_LINK_CSRF_TOKEN_TTL_SECONDS",
    "AI_LINK_LOGIN_MAX_FAILURES",
    "AI_LINK_LOGIN_WINDOW_SECONDS",
    "AI_LINK_LOGIN_BLOCK_SECONDS",
    "AI_LINK_LOGIN_MAX_KEYS",
    "AI_LINK_ADMIN_TOKEN",
    "AI_LINK_EXECUTOR_TOKEN",
    "AI_LINK_EXECUTOR_ID",
    "AI_LINK_CODEX_TOKEN",
    "AI_LINK_CODEX_SCOPES",
    "AI_LINK_EXECUTOR_HEARTBEAT_TTL_MS",
    "AI_LINK_CONNECTOR_PROBE_TTL_MS",
    "AI_LINK_ARTIFACT_RETENTION_DAYS",
    "AI_LINK_APPROVAL_RETENTION_DAYS",
    "AI_LINK_AUDIT_RETENTION_DAYS",
    "AI_LINK_MAINTENANCE_AUDIT_RETENTION_DAYS",
    "AI_LINK_HEARTBEAT_RETENTION_GRACE_HOURS",
    "AI_LINK_PROBE_RETENTION_GRACE_DAYS",
    "AI_LINK_RETENTION_MAX_ROWS_PER_TABLE",
    "AI_LINK_REQUIRE_CLOUDFLARE_ACCESS",
    "AI_LINK_ALLOWED_ACCESS_EMAILS",
    "AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN",
    "AI_LINK_CLOUDFLARE_ACCESS_AUD",
    "AI_LINK_CLOUDFLARE_TEAM_DOMAIN"
  )) {
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
  if ($renderText -match "autoDeployTrigger:\s*checksPass") {
    Add-Result $results "Render auto deploy" "pass" "Deploys wait for linked CI checks to pass."
  } else {
    Add-Result $results "Render auto deploy" "fail" "Set autoDeployTrigger to checksPass."
  }
  if ($renderText -match "numInstances:\s*1") {
    Add-Result $results "Render web instances" "pass" "Blueprint keeps one web instance for the in-process login limiter."
  } else {
    Add-Result $results "Render web instances" "fail" "Keep numInstances at 1 until login rate limits use a shared store."
  }
  $webRegionMatch = [regex]::Match($renderText, "(?s)services:.*?-\s*type:\s*web.*?region:\s*([a-z0-9-]+).*?(?=databases:)")
  $databaseRegionMatch = [regex]::Match($renderText, "(?s)databases:.*?-\s*name:\s*ai-link-postgres.*?region:\s*([a-z0-9-]+)")
  if ($webRegionMatch.Success -and $databaseRegionMatch.Success -and $webRegionMatch.Groups[1].Value -eq $databaseRegionMatch.Groups[1].Value) {
    Add-Result $results "Render region decision" "pass" "Web Service and Postgres use the same explicit region."
  } else {
    $status = if ($Production) { "fail" } else { "warn" }
    Add-Result $results "Render region decision" $status "Set the same explicit region for the Web Service and Postgres after owner approval."
  }
  if ($renderText -match "renderSubdomainPolicy:\s*disabled") {
    Add-Result $results "Render native subdomain" "pass" "The onrender.com subdomain is disabled by policy."
  } else {
    $status = if ($Production) { "fail" } else { "warn" }
    Add-Result $results "Render native subdomain" $status "Set renderSubdomainPolicy: disabled after the custom-domain rollback path is approved."
  }
  if ($renderText -match "domains:\s*(?:\[\s*auth\.xiao-qi-ai\.com\s*\]|\r?\n\s*-\s*auth\.xiao-qi-ai\.com(?:\s|$))") {
    Add-Result $results "Render custom domain" "pass" "The dedicated Auth Hub hostname is declared in the Blueprint."
  } else {
    $status = if ($Production) { "fail" } else { "warn" }
    Add-Result $results "Render custom domain" $status "Declare domains: auth.xiao-qi-ai.com before disabling the onrender.com subdomain."
  }
  if ($renderText -match "(?s)databases:.*?plan:\s*basic-256mb") {
    Add-Result $results "Render Postgres plan" "pass" "Blueprint uses the current basic-256mb database plan."
  } else {
    Add-Result $results "Render Postgres plan" "fail" "Use a current Render Postgres plan such as basic-256mb; legacy starter cannot create a new database."
  }
  if ($renderText -match "(?s)databases:.*?ipAllowList:\s*\[\]") {
    Add-Result $results "Render Postgres public access" "pass" "Database public IP allow list is empty."
  } else {
    Add-Result $results "Render Postgres public access" "fail" "Set database ipAllowList to [] so only private network connections are allowed."
  }
  if ($renderText -match "(?s)key:\s*AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN\s+sync:\s*false") {
    Add-Result $results "Cloudflare service-token decision" "pass" "Blueprint requires an explicit service-token policy decision."
  } else {
    Add-Result $results "Cloudflare service-token decision" "fail" "Do not enable service-token access implicitly in the public blueprint."
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

  if ($value.Length -lt 24 -and $name -notin @("AI_LINK_BASE_URL", "AI_LINK_EXECUTOR_ID")) {
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

foreach ($name in $requiredProductionAccessEnv) {
  $value = Get-EnvValue $name
  if ($value) {
    Add-Result $results "production access env $name" "pass" "Set without exposing value."
  } else {
    $status = if ($Production) { "fail" } else { "info" }
    Add-Result $results "production access env $name" $status "Required when checking production deployment."
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

  if ($Production -and $effectiveBaseUrl -match "voice\.xiao-qi-ai\.com") {
    Add-Result $results "base url host" "fail" "voice.xiao-qi-ai.com currently serves another application. Configure a dedicated Auth Hub hostname instead."
  } elseif ($Production -and $effectiveBaseUrl -notmatch "auth\.xiao-qi-ai\.com") {
    Add-Result $results "base url host" "warn" "Production target differs from the recommended dedicated hostname auth.xiao-qi-ai.com."
  } else {
    Add-Result $results "base url host" "pass" "Base URL host matches expected deployment mode."
  }
} else {
  $status = if ($Production) { "fail" } else { "warn" }
  Add-Result $results "base url" $status "No BaseUrl parameter or AI_LINK_BASE_URL found."
}

if ($Production) {
  $accessFlag = ([string](Get-EnvValue "AI_LINK_REQUIRE_CLOUDFLARE_ACCESS")).ToLowerInvariant()
  if ($accessFlag -eq "1" -or $accessFlag -eq "true" -or $accessFlag -eq "yes") {
    Add-Result $results "Cloudflare Access origin guard" "pass" "Application requires Cloudflare Access headers."
  } else {
    Add-Result $results "Cloudflare Access origin guard" "fail" "Set AI_LINK_REQUIRE_CLOUDFLARE_ACCESS=true for production."
  }

  $issuer = Get-EnvValue "AI_LINK_CLOUDFLARE_ACCESS_ISSUER"
  $teamDomain = Get-EnvValue "AI_LINK_CLOUDFLARE_TEAM_DOMAIN"
  if ($issuer -or $teamDomain) {
    Add-Result $results "Cloudflare Access issuer" "pass" "Issuer or team domain is configured."
  } else {
    Add-Result $results "Cloudflare Access issuer" "fail" "Set AI_LINK_CLOUDFLARE_TEAM_DOMAIN or AI_LINK_CLOUDFLARE_ACCESS_ISSUER for JWT validation."
  }

  $allowedEmails = Get-EnvValue "AI_LINK_ALLOWED_ACCESS_EMAILS"
  $serviceTokens = ([string](Get-EnvValue "AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN")).ToLowerInvariant()
  if ($allowedEmails) {
    Add-Result $results "Cloudflare Access allowed emails" "pass" "Allowed email list is configured."
  } else {
    Add-Result $results "Cloudflare Access allowed emails" "fail" "Set AI_LINK_ALLOWED_ACCESS_EMAILS for the approved browser operator."
  }

  if ($serviceTokens -eq "1" -or $serviceTokens -eq "true" -or $serviceTokens -eq "yes") {
    Add-Result $results "Cloudflare Access service tokens" "pass" "Local-executor Service Auth is explicitly enabled."
  } else {
    Add-Result $results "Cloudflare Access service tokens" "fail" "Set AI_LINK_CLOUDFLARE_ACCESS_ALLOW_SERVICE_TOKEN=true only after the local executor Service Auth path is approved."
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
