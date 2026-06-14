$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $root "runtime\tmp"
$processStatePath = Join-Path $runtimeDir "auth-hub-executor-process.json"

if (-not (Test-Path -LiteralPath $processStatePath)) {
  Write-Output "AI Link executor state file not found."
  exit 0
}

$state = Get-Content -LiteralPath $processStatePath -Raw | ConvertFrom-Json
$ids = @()
if ($state.processIds) {
  $ids = @($state.processIds | ForEach-Object { [int]$_ })
} elseif ($state.pid) {
  $ids = @([int]$state.pid)
}

foreach ($id in ($ids | Sort-Object -Descending -Unique)) {
  $process = Get-Process -Id $id -ErrorAction SilentlyContinue
  if ($process) {
    Stop-Process -Id $id -Force
  }
}

Remove-Item -LiteralPath $processStatePath -Force
Write-Output "AI Link executor stopped."
