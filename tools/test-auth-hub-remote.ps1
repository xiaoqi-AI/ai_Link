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
  [switch]$SkipAppLogin,
  [switch]$AccessGateOnly,
  [switch]$ExpectAccessGate,
  [ValidateSet("full_chain", "read_detect")]
  [string]$Workflow = "full_chain"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Net.Http

if (-not $BaseUrl) {
  $BaseUrl = $env:AI_LINK_BASE_URL
}

if (-not $BaseUrl) {
  throw "BaseUrl is required. Pass -BaseUrl or set AI_LINK_BASE_URL."
}

if ($AccessGateOnly -and -not $ExpectAccessGate) {
  throw "-AccessGateOnly requires -ExpectAccessGate so a public login page cannot be reported as a successful edge-gate check."
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

$targetUri = $null
try {
  $targetUri = [Uri]$BaseUrl
} catch {
  throw "BaseUrl must be a valid Auth Hub URL."
}
if (-not $targetUri.IsAbsoluteUri -or $targetUri.UserInfo) {
  throw "BaseUrl must be an absolute URL without embedded credentials."
}
$loopbackHosts = @("127.0.0.1", "::1", "localhost")
$isLoopbackTarget = $loopbackHosts -contains $targetUri.Host.ToLowerInvariant()
$approvedHosts = @($env:AI_LINK_AUTH_HUB_ALLOWED_HOSTS -split "," | ForEach-Object { $_.Trim().ToLowerInvariant() } | Where-Object { $_ })
if (-not $isLoopbackTarget -and ($targetUri.Scheme -ne "https" -or -not ($approvedHosts -contains $targetUri.Host.ToLowerInvariant()))) {
  throw "Remote Auth Hub must use HTTPS and its hostname must be listed in AI_LINK_AUTH_HUB_ALLOWED_HOSTS."
}
$attachAccessHeaders = -not $isLoopbackTarget

function New-CommonHeaders {
  param([switch]$WithoutAccess)

  $headers = @{}
  if ($WithoutAccess -or -not $attachAccessHeaders) {
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

function New-UserAccessHeaders {
  $headers = @{}
  if ($attachAccessHeaders -and $CfAccessJwt -and $CfAccessEmail) {
    $headers["cf-access-jwt-assertion"] = $CfAccessJwt
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
    [string]$ContentType = "application/json"
  )

  $handler = New-Object System.Net.Http.HttpClientHandler
  $handler.AllowAutoRedirect = $false
  $client = New-Object System.Net.Http.HttpClient($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(30)
  $request = New-Object System.Net.Http.HttpRequestMessage(
    (New-Object System.Net.Http.HttpMethod($Method.ToUpperInvariant())),
    $Uri
  )
  try {
    foreach ($name in $Headers.Keys) {
      $request.Headers.TryAddWithoutValidation([string]$name, [string]$Headers[$name]) | Out-Null
    }
    if ($null -ne $Body) {
      $request.Content = New-Object System.Net.Http.StringContent(
        [string]$Body,
        [System.Text.Encoding]::UTF8,
        $ContentType
      )
    }

    $response = $client.SendAsync($request).GetAwaiter().GetResult()
    $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    return [ordered]@{
      statusCode = [int]$response.StatusCode
      content = [string]$content
      location = [string]$response.Headers.Location
      cfRay = Get-HttpResponseHeaderValue $response "CF-Ray"
    }
  } finally {
    if ($response) {
      $response.Dispose()
    }
    $request.Dispose()
    $client.Dispose()
    $handler.Dispose()
  }
}

function Get-HttpResponseHeaderValue {
  param([System.Net.Http.HttpResponseMessage]$Response, [string]$Name)

  try {
    return [string]::Join(",", @($Response.Headers.GetValues($Name)))
  } catch {
    return ""
  }
}

function Get-CloudflareAccessGateEvidence {
  param([object]$Response)

  $location = ([string]$Response.location).ToLowerInvariant()
  if ($Response.statusCode -in @(301, 302, 303, 307, 308) -and
      $location -match '^https://[^/]+\.cloudflareaccess\.com/cdn-cgi/access/') {
    return "Cloudflare Access login redirect"
  }

  $content = ([string]$Response.content).ToLowerInvariant()
  $cfRay = [string]$Response.cfRay
  $looksLikeAccessPage = $content -match 'cloudflare access|cdn-cgi/access|access denied[^<]{0,120}cloudflare'
  $looksLikeApplicationGuard = $content -match 'cloudflare_access_(required|invalid|forbidden)|missing cloudflare access|cloudflare access verification required'
  if ($Response.statusCode -in @(401, 403) -and $cfRay -and $looksLikeAccessPage -and -not $looksLikeApplicationGuard) {
    return "Cloudflare Access edge response"
  }

  return ""
}

function Invoke-Json {
  param(
    [string]$Uri,
    [string]$Method = "Get",
    [hashtable]$Headers = @{},
    [string]$Body = ""
  )

  $response = Invoke-HttpStatus -Uri $Uri -Method $Method -Headers $Headers -Body $(if ($Body) { $Body } else { $null })
  if ($response.statusCode -lt 200 -or $response.statusCode -ge 300) {
    throw "Auth Hub request returned HTTP $($response.statusCode); redirects are not followed."
  }
  if (-not $response.content) {
    return $null
  }
  try {
    return $response.content | ConvertFrom-Json
  } catch {
    throw "Auth Hub returned invalid JSON."
  }
}

function Invoke-BrowserRequest {
  param(
    [System.Net.Http.HttpClient]$Client,
    [string]$Uri,
    [string]$Method = "Get",
    [hashtable]$Headers = @{},
    [object]$Body = $null,
    [string]$ContentType = "application/json"
  )

  $request = New-Object System.Net.Http.HttpRequestMessage(
    (New-Object System.Net.Http.HttpMethod($Method.ToUpperInvariant())),
    $Uri
  )
  $response = $null
  try {
    foreach ($name in $Headers.Keys) {
      $request.Headers.TryAddWithoutValidation([string]$name, [string]$Headers[$name]) | Out-Null
    }
    if ($null -ne $Body) {
      $request.Content = New-Object System.Net.Http.StringContent(
        [string]$Body,
        [System.Text.Encoding]::UTF8,
        $ContentType
      )
    }
    $response = $Client.SendAsync($request).GetAwaiter().GetResult()
    $content = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    return [ordered]@{
      statusCode = [int]$response.StatusCode
      content = [string]$content
      location = [string]$response.Headers.Location
    }
  } finally {
    if ($response) {
      $response.Dispose()
    }
    $request.Dispose()
  }
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
    $gateEvidence = Get-CloudflareAccessGateEvidence $login
    if ($gateEvidence) {
      Add-Check "access gate" "pass" "Unauthenticated login request produced verified edge evidence: $gateEvidence."
    } else {
      Add-Check "access gate" "fail" "HTTP $($login.statusCode) did not prove a Cloudflare Access edge decision; an application-origin 401/403 is not sufficient."
    }
  } elseif ($login.statusCode -eq 200) {
    Add-Check "login page" "pass" "Application login page is reachable."
  } else {
    Add-Check "login page" "fail" "Login response returned HTTP $($login.statusCode)."
  }
} catch {
  Add-Check "login page" "fail" $_.Exception.Message
}

if ($AccessGateOnly) {
  $failed = @($result.checks | Where-Object { $_.status -eq "fail" })
  $result.ok = $failed.Count -eq 0
  $result | ConvertTo-Json -Depth 6
  if ($failed.Count -gt 0) {
    exit 1
  }
  exit 0
}

if ($SkipAppLogin) {
  if ($CfAccessClientId -and $CfAccessClientSecret) {
    Add-Check "app login" "warn" "Browser login was intentionally left for the approved-email interactive acceptance; a service token is not a browser identity."
  } else {
    Add-Check "app login" "fail" "-SkipAppLogin is reserved for a Service Auth remote smoke and requires both Cloudflare service credentials."
  }
} elseif ($AppPassword) {
  if (($CfAccessClientId -or $CfAccessClientSecret) -and -not ($CfAccessJwt -and $CfAccessEmail)) {
    Add-Check "app login" "fail" "Service Auth cannot prove browser login. Use -SkipAppLogin for the API/executor smoke and complete approved-email login manually."
  } else {
  try {
    $browserHandler = New-Object System.Net.Http.HttpClientHandler
    $browserHandler.AllowAutoRedirect = $false
    $browserHandler.UseCookies = $true
    $browserHandler.CookieContainer = New-Object System.Net.CookieContainer
    $browserClient = New-Object System.Net.Http.HttpClient($browserHandler)
    $browserClient.Timeout = [TimeSpan]::FromSeconds(30)
    $userAccessHeaders = New-UserAccessHeaders
    $loginPage = Invoke-BrowserRequest -Client $browserClient -Uri "$BaseUrl/login" -Headers $userAccessHeaders
    if ($loginPage.statusCode -ne 200) {
      throw "Login page returned HTTP $($loginPage.statusCode); redirects are not followed."
    }
    $csrfMatch = [regex]::Match($loginPage.content, 'name="csrfToken" value="([^"]+)"')
    if (-not $csrfMatch.Success) {
      throw "Login page did not provide a request token."
    }
    $csrfToken = $csrfMatch.Groups[1].Value
    $form = "password=$([uri]::EscapeDataString($AppPassword))&next=%2Fdashboard&csrfToken=$([uri]::EscapeDataString($csrfToken))"
    $loginPostHeaders = New-UserAccessHeaders
    $loginPostHeaders["Origin"] = $BaseUrl
    $loginResult = Invoke-BrowserRequest `
      -Client $browserClient `
      -Uri "$BaseUrl/login" `
      -Method "Post" `
      -Headers $loginPostHeaders `
      -Body $form `
      -ContentType "application/x-www-form-urlencoded"

    if ($loginResult.statusCode -ne 303 -or -not $loginResult.location) {
      throw "Login returned HTTP $($loginResult.statusCode); expected a same-origin 303 redirect."
    }
    $dashboardUri = [Uri]::new($targetUri, [string]$loginResult.location)
    if (
      $dashboardUri.Scheme -ne $targetUri.Scheme `
      -or $dashboardUri.Host -ne $targetUri.Host `
      -or $dashboardUri.Port -ne $targetUri.Port `
      -or $dashboardUri.AbsolutePath -ne "/dashboard"
    ) {
      throw "Login redirect must remain on the approved Auth Hub origin and target /dashboard."
    }
    $dashboard = Invoke-BrowserRequest -Client $browserClient -Uri $dashboardUri.AbsoluteUri -Headers (New-UserAccessHeaders)
    if ($dashboard.statusCode -eq 200 -and $dashboard.content -match "AI Link") {
      Add-Check "app login" "pass" "Application login reaches dashboard with session cookie."
    } else {
      Add-Check "app login" "fail" "Dashboard did not return the expected console page."
    }
  } catch {
    Add-Check "app login" "fail" $_.Exception.Message
  } finally {
    if ($browserClient) {
      $browserClient.Dispose()
    }
    if ($browserHandler) {
      $browserHandler.Dispose()
    }
  }
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
