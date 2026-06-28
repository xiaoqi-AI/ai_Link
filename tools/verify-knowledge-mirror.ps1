param(
  [string]$WikiRoot = "D:\codex_workplace\llm-wiki"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$mirror = Join-Path $WikiRoot "wiki\projects\ai_Link"
$manifestPath = Join-Path $mirror "mirror-manifest.json"

if (-not (Test-Path -LiteralPath $manifestPath)) {
  Write-Host "Mirror manifest missing: $manifestPath"
  exit 1
}

$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
$errors = @()

foreach ($file in $manifest.files) {
  $source = Join-Path $root ($file.path.Replace("/", "\"))
  $target = Join-Path $mirror ($file.path.Replace("/", "\"))

  if (-not (Test-Path -LiteralPath $source)) {
    $errors += "Missing source: $($file.path)"
    continue
  }
  if (-not (Test-Path -LiteralPath $target)) {
    $errors += "Missing mirror: $($file.path)"
    continue
  }

  $sourceHash = (Get-FileHash -Algorithm SHA256 -Path $source).Hash.ToLowerInvariant()
  $targetHash = (Get-FileHash -Algorithm SHA256 -Path $target).Hash.ToLowerInvariant()
  if ($sourceHash -ne $targetHash) {
    $errors += "Hash mismatch: $($file.path)"
  }
}

if ($errors.Count -gt 0) {
  Write-Host "Knowledge mirror verification failed:"
  $errors | ForEach-Object { Write-Host " - $_" }
  exit 1
}

Write-Host "Knowledge mirror verification passed."
