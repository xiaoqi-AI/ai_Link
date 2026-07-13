param(
  [string]$BaseUrl = "",
  [string]$AdminToken = "",
  [string]$ExecutorToken = "",
  [string]$CodexToken = "",
  [string]$AppPassword = "",
  [string]$CfAccessClientId = "",
  [string]$CfAccessClientSecret = "",
  [string]$CfAccessJwt = "",
  [string]$CfAccessEmail = "",
  [switch]$SkipExecutor,
  [switch]$ExpectAccessGate,
  [ValidateSet("full_chain", "read_detect")]
  [string]$Workflow = "full_chain"
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

if (-not $CodexToken) {
  $CodexToken = $env:AI_LINK_CODEX_TOKEN
}

if (-not $AppPassword) {
  $AppPassword = $env:AI_LINK_APP_PASSWORD
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
  param([switch]$WithoutAccess)

  $headers = @{}
  if ($WithoutAccess) {
    return $headers
  }

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

function Invoke-HttpStatus {
  param(
    [string]$Uri,
    [string]$Method = "Get",
    [hashtable]$Headers = @{},
    [object]$Body = $null,
    [string]$ContentType = "application/json",
    [Microsoft.PowerShell.Commands.WebRequestSession]$WebSession = $null
  )

  $parameters = @{
    Uri = $Uri
    Method = $Method
    Headers = $Headers
    TimeoutSec = 30
    UseBasicParsing = $true
    MaximumRedirection = 0
    ErrorAction = "Stop"
  }
  if ($WebSession) {
    $parameters["WebSession"] = $WebSession
  }
  if ($null -ne $Body) {
    $parameters["ContentType"] = $ContentType
    $parameters["Body"] = $Body
  }

  try {
    $response = Invoke-WebRequest @parameters
    return [ordered]@{
      statusCode = [int]$response.StatusCode
      content = [string]$response.Content
    }
  } catch {
    $response = $_.Exception.Response
    if ($response) {
      return [ordered]@{
        statusCode = [int]$response.StatusCode
        content = ""
      }
    }
    throw
  }
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
  workflow = $Workflow
  taskId = $null
  finalStatus = $null
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
  $loginHeaders = if ($ExpectAccessGate) { New-CommonHeaders -WithoutAccess } else { New-CommonHeaders }
  $login = Invoke-HttpStatus -Uri "$BaseUrl/login" -Headers $loginHeaders
  if ($ExpectAccessGate) {
    if ($login.statusCode -in @(302, 401, 403)) {
      Add-Check "access gate" "pass" "Unauthenticated login request was blocked or redirected before app login."
    } else {
      Add-Check "access gate" "fail" "Unauthenticated login request returned HTTP $($login.statusCode); verify Cloudflare Access policy."
    }
  } elseif ($login.statusCode -eq 200) {
    Add-Check "login page" "pass" "Application login page is reachable."
  } else {
    Add-Check "login page" "fail" "Login response returned HTTP $($login.statusCode)."
  }
} catch {
  Add-Check "login page" "fail" $_.Exception.Message
}

if ($AppPassword) {
  try {
    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $form = "password=$([uri]::EscapeDataString($AppPassword))&next=%2Fdashboard"
    $loginResult = Invoke-WebRequest `
      -Uri "$BaseUrl/login" `
      -Method "Post" `
      -Headers (New-CommonHeaders) `
      -Body $form `
      -ContentType "application/x-www-form-urlencoded" `
      -WebSession $session `
      -UseBasicParsing `
      -TimeoutSec 30

    if ($loginResult.StatusCode -eq 200) {
      $dashboard = Invoke-WebRequest -Uri "$BaseUrl/dashboard" -Headers (New-CommonHeaders) -WebSession $session -UseBasicParsing -TimeoutSec 30
      if ($dashboard.StatusCode -eq 200 -and $dashboard.Content -match "AI Link") {
        Add-Check "app login" "pass" "Application login reaches dashboard with session cookie."
      } else {
        Add-Check "app login" "fail" "Dashboard did not return the expected console page."
      }
    } else {
      Add-Check "app login" "fail" "Login returned HTTP $($loginResult.StatusCode)."
    }
  } catch {
    Add-Check "app login" "fail" $_.Exception.Message
  }
} else {
  Add-Check "app login" "fail" "App password is required for a complete remote smoke."
}

if ($AdminToken) {
  $adminHeaders = New-AuthHeaders $AdminToken
  $codexHeaders = New-AuthHeaders $CodexToken
  try {
    $createBody = @(
      "{"
      '"workflow":"' + $Workflow + '",'
      '"input":{'
      '"title":"remote smoke task",'
      '"text":"public smoke-test text for remote auth hub verification"'
      "}"
      "}"
    ) -join ""
    $task = Invoke-Json -Uri "$BaseUrl/api/tasks" -Method "Post" -Headers $adminHeaders -Body $createBody
    $result.taskId = $task.task.id
    Add-Check "api task create" "pass" "Created task $($task.task.id)."

    try {
      $connectors = Invoke-Json -Uri "$BaseUrl/api/connectors" -Headers $adminHeaders
      $connectorJson = ($connectors | ConvertTo-Json -Depth 8).ToLowerInvariant()
      if ($connectors.connectors -and -not ($connectorJson -match "cookie|browserprofile|runtime/private")) {
        Add-Check "connectors status" "pass" "Connector contract status is readable without private state."
      } else {
        Add-Check "connectors status" "fail" "Connector response is missing or contains private-state markers."
      }
    } catch {
      Add-Check "connectors status" "fail" $_.Exception.Message
    }

    if ($CodexToken) {
      try {
        $codexRead = Invoke-Json -Uri "$BaseUrl/api/tasks/$($task.task.id)" -Headers $codexHeaders
        if ($codexRead.task.id -eq $task.task.id) {
          Add-Check "codex task read" "pass" "Restricted Codex token can read the redacted task result."
        } else {
          Add-Check "codex task read" "fail" "Restricted Codex token did not read the expected task."
        }
      } catch {
        Add-Check "codex task read" "fail" $_.Exception.Message
      }

      try {
        $deniedLease = Invoke-HttpStatus `
          -Uri "$BaseUrl/api/executor/lease" `
          -Method "Post" `
          -Headers $codexHeaders `
          -Body '{"executorId":"codex-boundary-check"}'
        if ($deniedLease.statusCode -eq 403) {
          Add-Check "codex executor denied" "pass" "Restricted Codex token cannot lease executor work."
        } else {
          Add-Check "codex executor denied" "fail" "Expected HTTP 403, got HTTP $($deniedLease.statusCode)."
        }
      } catch {
        Add-Check "codex executor denied" "fail" $_.Exception.Message
      }
    } else {
      Add-Check "codex token boundary" "fail" "Restricted Codex token is required for a complete remote smoke."
    }

    if (-not $SkipExecutor) {
      if (-not $ExecutorToken) {
        Add-Check "executor token" "fail" "Executor token is required unless -SkipExecutor is used."
      } else {
        $env:AI_LINK_BASE_URL = $BaseUrl
        $env:AI_LINK_EXECUTOR_TOKEN = $ExecutorToken
        # This command is the public mock smoke. Real private connector checks
        # require a separate, explicitly approved workflow.
        $env:AI_LINK_PRIVATE_CONNECTOR_MODULE = ""
        if ($CfAccessClientId -and $CfAccessClientSecret) {
          $env:CF_ACCESS_CLIENT_ID = $CfAccessClientId
          $env:CF_ACCESS_CLIENT_SECRET = $CfAccessClientSecret
        }
        if ($CfAccessJwt) {
          $env:AI_LINK_CF_ACCESS_TEST_JWT = $CfAccessJwt
        }
        if ($CfAccessEmail) {
          $env:AI_LINK_CF_ACCESS_TEST_EMAIL = $CfAccessEmail
        }

        $firstRun = npm run auth-hub:executor:once
        $afterFirstRun = Invoke-Json -Uri "$BaseUrl/api/tasks/$($task.task.id)" -Headers $adminHeaders

        try {
          $runtime = Invoke-Json -Uri "$BaseUrl/api/connectors" -Headers $adminHeaders
          $runtimeJson = ($runtime.executorRuntime | ConvertTo-Json -Depth 10).ToLowerInvariant()
          if ($runtime.executorRuntime.summary.online -ge 1 -and -not ($runtimeJson -match '"mode"\s*:\s*"private"')) {
            Add-Check "executor heartbeat" "pass" "Mock executor heartbeat is visible and contains no private connector mode."
          } else {
            Add-Check "executor heartbeat" "fail" "Expected a fresh mock-only executor heartbeat."
          }
        } catch {
          Add-Check "executor heartbeat" "fail" $_.Exception.Message
        }

        if ($Workflow -eq "read_detect") {
          if ($afterFirstRun.task.status -eq "completed") {
            Add-Check "executor roundtrip" "pass" "Executor completed read_detect remote task."
          } else {
            Add-Check "executor roundtrip" "fail" "Task status is $($afterFirstRun.task.status), expected completed. Executor output: $($firstRun -join ' ')"
          }
        } else {
          $approval = $afterFirstRun.approvals | Where-Object { $_.status -eq "pending" } | Select-Object -First 1
          if ($afterFirstRun.task.status -eq "approval_required" -and $approval) {
            Add-Check "approval requested" "pass" "Executor requested publish approval before completion."
          } else {
            Add-Check "approval requested" "fail" "Task status is $($afterFirstRun.task.status), expected approval_required."
          }

          if ($CodexToken -and $approval) {
            $denyApproveBody = @(
              "{"
              '"approvalId":"' + $approval.id + '",'
              '"approved":true,'
              '"note":"codex boundary check"'
              "}"
            ) -join ""
            $deniedApprove = Invoke-HttpStatus `
              -Uri "$BaseUrl/api/tasks/$($task.task.id)/approve" `
              -Method "Post" `
              -Headers $codexHeaders `
              -Body $denyApproveBody
            if ($deniedApprove.statusCode -eq 403) {
              Add-Check "codex approval denied" "pass" "Restricted Codex token cannot approve publish."
            } else {
              Add-Check "codex approval denied" "fail" "Expected HTTP 403, got HTTP $($deniedApprove.statusCode)."
            }
          }

          if ($approval) {
            $approveBody = @(
              "{"
              '"approvalId":"' + $approval.id + '",'
              '"approved":true,'
              '"note":"remote smoke test approval"'
              "}"
            ) -join ""
            $approved = Invoke-Json -Uri "$BaseUrl/api/tasks/$($task.task.id)/approve" -Method "Post" -Headers $adminHeaders -Body $approveBody
            if ($approved.task.status -eq "queued" -and $approved.task.currentStep -eq "publish") {
              Add-Check "admin approval" "pass" "Admin token approved the mock publish continuation."
            } else {
              Add-Check "admin approval" "fail" "Approval did not requeue publish step."
            }

            $secondRun = npm run auth-hub:executor:once
            $taskDetail = Invoke-Json -Uri "$BaseUrl/api/tasks/$($task.task.id)" -Headers $adminHeaders
            if ($taskDetail.task.status -eq "completed") {
              Add-Check "executor roundtrip" "pass" "Executor completed remote task after approval."
            } else {
              Add-Check "executor roundtrip" "fail" "Task status is $($taskDetail.task.status), expected completed. Executor output: $($secondRun -join ' ')"
            }
          }
        }
      }
    } else {
      Add-Check "executor roundtrip" "warn" "Executor run skipped by request."
    }

    $taskDetail = Invoke-Json -Uri "$BaseUrl/api/tasks/$($task.task.id)" -Headers $adminHeaders
    $result.finalStatus = $taskDetail.task.status
    $detailJson = ($taskDetail | ConvertTo-Json -Depth 10)
    $containsMarker = $false
    foreach ($marker in @("cookie", "browserprofile", "runtime/private", "qr", "screenshot", "rawhtml")) {
      if ($detailJson.ToLowerInvariant().Contains($marker)) {
        $containsMarker = $true
      }
    }
    if (-not $containsMarker) {
      Add-Check "redacted task detail" "pass" "Task detail contains no private-state markers."
    } else {
      Add-Check "redacted task detail" "fail" "Task detail contains private-state markers."
    }

    $audit = Invoke-Json -Uri "$BaseUrl/api/audit?taskId=$($task.task.id)&limit=50" -Headers $adminHeaders
    if ($audit.auditEvents.Count -gt 0) {
      Add-Check "audit log" "pass" "Task audit events are readable."
    } else {
      Add-Check "audit log" "fail" "No audit events returned for the smoke task."
    }
  } catch {
    Add-Check "api task create" "fail" $_.Exception.Message
  }
} else {
  Add-Check "api token" "fail" "Admin token is required for a complete remote smoke."
}

$failed = @($result.checks | Where-Object { $_.status -eq "fail" })
$result.ok = $failed.Count -eq 0
$result | ConvertTo-Json -Depth 6

if ($failed.Count -gt 0) {
  exit 1
}
