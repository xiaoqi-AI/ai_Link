param(
  [string]$BaseUrl = "",
  [string]$AdminToken = "",
  [string]$ExecutorToken = "",
  [string]$CfAccessClientId = "",
  [string]$CfAccessClientSecret = "",
  [string]$CfAccessJwt = "",
  [string]$CfAccessEmail = "",
  [switch]$SkipExecutor,
  [switch]$ExpectAccessGate
)

$ErrorActionPreference = "Stop"

if (-not $BaseUrl) {
  $BaseUrl = $env:AI_LINK_BASE_URL
}

if (-not $BaseUrl) {
  throw "BaseUrl is required. Pass -BaseUrl or set AI_LINK_BASE_URL."
}

$BaseUrl = $BaseUrl.TrimEnd("/")

if (-not $AdminToken) {
  $AdminToken = $env:AI_LINK_ADMIN_TOKEN
}

if (-not $ExecutorToken) {
  $ExecutorToken = $env:AI_LINK_EXECUTOR_TOKEN
}

if (-not $CfAccessClientId) {
  $CfAccessClientId = $env:CF_ACCESS_CLIENT_ID
}

if (-not $CfAccessClientSecret) {
  $CfAccessClientSecret = $env:CF_ACCESS_CLIENT_SECRET
}

if (-not $CfAccessJwt) {
  $CfAccessJwt = $env:AI_LINK_CF_ACCESS_TEST_JWT
}

if (-not $CfAccessEmail) {
  $CfAccessEmail = $env:AI_LINK_CF_ACCESS_TEST_EMAIL
}

function New-CommonHeaders {
  $headers = @{}
  if ($CfAccessClientId -and $CfAccessClientSecret) {
    $headers["CF-Access-Client-Id"] = $CfAccessClientId
    $headers["CF-Access-Client-Secret"] = $CfAccessClientSecret
  }
  if ($CfAccessJwt) {
    $headers["cf-access-jwt-assertion"] = $CfAccessJwt
  }
  if ($CfAccessEmail) {
    $headers["cf-access-authenticated-user-email"] = $CfAccessEmail
  }
  return $headers
}

function New-AuthHeaders {
  param([string]$Token)
  $headers = New-CommonHeaders
  if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
  }
  return $headers
}

function Invoke-Json {
  param(
    [string]$Uri,
    [string]$Method = "Get",
    [hashtable]$Headers = @{},
    [string]$Body = ""
  )

  if ($Body) {
    return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $Headers -ContentType "application/json" -Body $Body -TimeoutSec 30
  }

  return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $Headers -TimeoutSec 30
}

$result = [ordered]@{
  ok = $false
  baseUrl = $BaseUrl
  checks = @()
}

function Add-Check {
  param([string]$Name, [string]$Status, [string]$Detail)
  $script:result.checks += [ordered]@{
    name = $Name
    status = $Status
    detail = $Detail
  }
}

try {
  $health = Invoke-Json -Uri "$BaseUrl/healthz" -Headers (New-CommonHeaders)
  if ($health.ok) {
    Add-Check "healthz" "pass" "Remote health endpoint returned ok."
  } else {
    Add-Check "healthz" "fail" "Remote health endpoint did not return ok."
  }
} catch {
  Add-Check "healthz" "fail" $_.Exception.Message
}

try {
  $login = Invoke-WebRequest -Uri "$BaseUrl/login" -Headers (New-CommonHeaders) -UseBasicParsing -MaximumRedirection 0 -TimeoutSec 30 -ErrorAction Stop
  if ($ExpectAccessGate) {
    Add-Check "access gate" "warn" "Login page is directly reachable; verify Cloudflare Access policy manually."
  } elseif ($login.StatusCode -eq 200) {
    Add-Check "login page" "pass" "Application login page is reachable."
  } else {
    Add-Check "login page" "warn" "Login response did not match expected content."
  }
} catch {
  $response = $_.Exception.Response
  if ($ExpectAccessGate -and $response -and ([int]$response.StatusCode -in @(302, 401, 403))) {
    Add-Check "access gate" "pass" "Unauthenticated login request was blocked or redirected."
  } else {
    Add-Check "login page" "warn" $_.Exception.Message
  }
}

if ($AdminToken) {
  $adminHeaders = New-AuthHeaders $AdminToken
  try {
    $createBody = @(
      "{"
      '"workflow":"read_detect",'
      '"input":{'
      '"title":"remote smoke task",'
      '"text":"public smoke-test text for remote auth hub verification"'
      "}"
      "}"
    ) -join ""
    $task = Invoke-Json -Uri "$BaseUrl/api/tasks" -Method "Post" -Headers $adminHeaders -Body $createBody
    Add-Check "api task create" "pass" "Created task $($task.task.id)."

    if (-not $SkipExecutor) {
      if (-not $ExecutorToken) {
        Add-Check "executor token" "fail" "Executor token is required unless -SkipExecutor is used."
      } else {
        $env:AI_LINK_BASE_URL = $BaseUrl
        $env:AI_LINK_EXECUTOR_TOKEN = $ExecutorToken
        if ($CfAccessClientId -and $CfAccessClientSecret) {
          $env:CF_ACCESS_CLIENT_ID = $CfAccessClientId
          $env:CF_ACCESS_CLIENT_SECRET = $CfAccessClientSecret
        }
        $run = npm run auth-hub:executor:once
        $taskDetail = Invoke-Json -Uri "$BaseUrl/api/tasks/$($task.task.id)" -Headers $adminHeaders
        if ($taskDetail.task.status -eq "completed") {
          Add-Check "executor roundtrip" "pass" "Executor completed remote task."
        } else {
          Add-Check "executor roundtrip" "fail" "Task status is $($taskDetail.task.status), expected completed. Executor output: $($run -join ' ')"
        }
      }
    }
  } catch {
    Add-Check "api task create" "fail" $_.Exception.Message
  }
} else {
  Add-Check "api token" "warn" "Admin token not provided; API task create skipped."
}

$failed = @($result.checks | Where-Object { $_.status -eq "fail" })
$result.ok = $failed.Count -eq 0
$result | ConvertTo-Json -Depth 6

if ($failed.Count -gt 0) {
  exit 1
}
