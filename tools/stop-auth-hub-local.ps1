$ErrorActionPreference = "Stop"

$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$runtimeDir = Join-Path $root "runtime\tmp"
$statePath = Join-Path $runtimeDir "auth-hub-local.json"

if (-not (Test-Path -LiteralPath $statePath)) {
  Write-Output "AI Link auth hub state file not found."
  exit 0
}

$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
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

Remove-Item -LiteralPath $statePath -Force
Write-Output "AI Link auth hub stopped."
