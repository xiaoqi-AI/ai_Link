param(
  [string]$BaseUrl = "",
  [string]$ExecutorToken = "",
  [string]$ExecutorId = "local-executor",
  [int]$IntervalSeconds = 10
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $root "runtime\tmp"
$hubStatePath = Join-Path $runtimeDir "auth-hub-local.json"
$executorStatePath = Join-Path $runtimeDir "auth-hub-executor.json"
$processStatePath = Join-Path $runtimeDir "auth-hub-executor-process.json"
$runnerPath = Join-Path $runtimeDir "auth-hub-executor-runner.ps1"

New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null

function Get-ProcessTreeIds {
  param([int]$RootPid)

  $ids = New-Object System.Collections.Generic.List[int]
  $queue = New-Object System.Collections.Generic.Queue[int]
  $queue.Enqueue($RootPid)
  while ($queue.Count -gt 0) {
    $current = $queue.Dequeue()
    if (-not $ids.Contains($current)) {
      $ids.Add($current)
      Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $current } | ForEach-Object {
        $queue.Enqueue([int]$_.ProcessId)
      }
    }
  }
  return $ids.ToArray()
}

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

if (-not $ExecutorToken) {
  $ExecutorToken = $env:AI_LINK_EXECUTOR_TOKEN
}

if (-not $ExecutorToken) {
  $ExecutorToken = "dev-executor-token"
}

if (Test-Path -LiteralPath $processStatePath) {
  $existing = Get-Content -LiteralPath $processStatePath -Raw | ConvertFrom-Json
  $existingProcess = Get-Process -Id ([int]$existing.pid) -ErrorAction SilentlyContinue
  if ($existingProcess) {
    Write-Output "AI Link executor is already running for $($existing.baseUrl)"
    exit 0
  }
}

$logPath = Join-Path $runtimeDir "auth-hub-executor.log"
$intervalMs = $IntervalSeconds * 1000
@"
`$env:AI_LINK_BASE_URL='$BaseUrl'
`$env:AI_LINK_EXECUTOR_TOKEN='$ExecutorToken'
`$env:AI_LINK_EXECUTOR_ID='$ExecutorId'
`$env:AI_LINK_EXECUTOR_INTERVAL_MS='$intervalMs'
`$env:AI_LINK_EXECUTOR_STATE_PATH='$executorStatePath'
npm run auth-hub:executor *> '$logPath'
"@ | Set-Content -LiteralPath $runnerPath -Encoding UTF8

$process = Start-Process -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $runnerPath) `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -PassThru

$state = [ordered]@{
  pid = $process.Id
  processIds = @(Get-ProcessTreeIds -RootPid $process.Id)
  baseUrl = $BaseUrl
  executorId = $ExecutorId
  intervalSeconds = $IntervalSeconds
  statePath = $executorStatePath
  logPath = $logPath
  runnerPath = $runnerPath
  startedAt = (Get-Date).ToString("o")
}

$state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $processStatePath -Encoding UTF8
$state | ConvertTo-Json -Compress -Depth 6
