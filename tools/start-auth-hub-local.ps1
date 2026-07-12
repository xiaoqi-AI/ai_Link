param(
  [int]$Port = 10001,
  [string]$HostName = "127.0.0.1"
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $root "runtime\tmp"
$statePath = Join-Path $runtimeDir "auth-hub-local.json"

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

if (Test-Path -LiteralPath $statePath) {
  $existing = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
  $existingProcess = Get-Process -Id ([int]$existing.pid) -ErrorAction SilentlyContinue
  if ($existingProcess) {
    Write-Output "AI Link auth hub is already running at $($existing.url)"
    exit 0
  }
}

while (Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue) {
  $Port++
}

$logPath = Join-Path $runtimeDir "auth-hub-$Port.log"
$url = "http://$HostName`:$Port"
$executorId = if ($env:AI_LINK_EXECUTOR_ID) { $env:AI_LINK_EXECUTOR_ID } else { "local-executor" }
$command = "`$env:PORT='$Port'; `$env:AI_LINK_EXECUTOR_ID='$executorId'; npm run auth-hub:start *> '$logPath'"

$process = Start-Process -FilePath "powershell.exe" `
  -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $command) `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -PassThru

Start-Sleep -Seconds 4

try {
  $health = Invoke-RestMethod -Uri "$url/healthz" -TimeoutSec 10
} catch {
  Get-Content -LiteralPath $logPath -Tail 80 -ErrorAction SilentlyContinue
  throw
}

$state = [ordered]@{
  pid = $process.Id
  processIds = @(Get-ProcessTreeIds -RootPid $process.Id)
  port = $Port
  url = $url
  logPath = $logPath
  health = $health
  startedAt = (Get-Date).ToString("o")
}

$state | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $statePath -Encoding UTF8
$state | ConvertTo-Json -Compress -Depth 6
