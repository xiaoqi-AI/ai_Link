param(
  [string]$BaseUrl = "",
  [string]$AdminToken = "",
  [string]$ExecutorToken = ""
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $root "runtime\tmp"
$hubStatePath = Join-Path $runtimeDir "auth-hub-local.json"

if (-not $BaseUrl) {
  if (Test-Path -LiteralPath $hubStatePath) {
    $hubState = Get-Content -LiteralPath $hubStatePath -Raw | ConvertFrom-Json
    $BaseUrl = $hubState.url
  } else {
    $BaseUrl = $env:AI_LINK_BASE_URL
  }
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

if (-not $ExecutorToken) {
  $ExecutorToken = $env:AI_LINK_EXECUTOR_TOKEN
}

if (-not $ExecutorToken) {
  $ExecutorToken = "dev-executor-token"
}

$adminHeaders = @{ Authorization = "Bearer $AdminToken" }

$health = Invoke-RestMethod -Uri ($BaseUrl + "/healthz") -TimeoutSec 10
if (-not $health.ok) {
  throw "Health check failed"
}

$createTaskBody = @(
  "{"
  '"workflow":"full_chain",'
  '"input":{'
  '"title":"local smoke task",'
  '"text":"public smoke-test text for auth hub executor approval and publish simulation"'
  "}"
  "}"
) -join ""

$task = Invoke-RestMethod -Uri ($BaseUrl + "/api/tasks") `
  -Method Post `
  -Headers $adminHeaders `
  -ContentType "application/json" `
  -Body $createTaskBody

$env:AI_LINK_BASE_URL = $BaseUrl
$env:AI_LINK_EXECUTOR_TOKEN = $ExecutorToken
$firstRun = npm run auth-hub:executor:once

$taskUrl = $BaseUrl + "/api/tasks/" + $task.task.id
$detail = Invoke-RestMethod -Uri $taskUrl -Headers $adminHeaders
$approval = $detail.approvals | Where-Object { $_.status -eq "pending" } | Select-Object -First 1
if (-not $approval) {
  throw "Approval was not created"
}

$approveBody = @(
  "{"
  '"approvalId":"' + $approval.id + '",'
  '"approved":true,'
  '"note":"local smoke test"'
  "}"
) -join ""

Invoke-RestMethod -Uri ($taskUrl + "/approve") `
  -Method Post `
  -Headers $adminHeaders `
  -ContentType "application/json" `
  -Body $approveBody | Out-Null

$secondRun = npm run auth-hub:executor:once
$final = Invoke-RestMethod -Uri $taskUrl -Headers $adminHeaders

if ($final.task.status -ne "completed") {
  throw "Final task status is $($final.task.status), expected completed"
}

[ordered]@{
  ok = $true
  baseUrl = $BaseUrl
  taskId = $task.task.id
  firstExecutorRun = ($firstRun -join " ")
  secondExecutorRun = ($secondRun -join " ")
  finalStatus = $final.task.status
  finalStep = $final.task.currentStep
} | ConvertTo-Json -Compress -Depth 6
