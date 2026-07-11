param(
  [string]$Config = "",
  [string]$Credentials = "",
  [string]$History = "",
  [string]$Output = "",
  [string]$ReportOutput = "",
  [string]$ProxyUrl = "",
  [switch]$UseEnvProxy
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$PrivateRoot = [IO.Path]::GetFullPath((Join-Path $RepoRoot "runtime\private"))
$TmpRoot = [IO.Path]::GetFullPath((Join-Path $RepoRoot "runtime\tmp"))

if ([string]::IsNullOrWhiteSpace($Config)) {
  $Config = Join-Path $RepoRoot "examples\google-search-console\voice-site.domain.public.json"
}
if ([string]::IsNullOrWhiteSpace($Credentials)) {
  $Credentials = Join-Path $PrivateRoot "google-search-console\authorized-user.json"
}
if ([string]::IsNullOrWhiteSpace($History)) {
  $History = Join-Path $PrivateRoot "google-search-console\domain-history.json"
}
if ([string]::IsNullOrWhiteSpace($Output)) {
  $Output = Join-Path $TmpRoot "gsc-live-domain-check.json"
}
if ([string]::IsNullOrWhiteSpace($ReportOutput)) {
  $ReportOutput = Join-Path $TmpRoot "gsc-live-domain-report.md"
}

function Resolve-FullPath([string]$Value) {
  if ([IO.Path]::IsPathRooted($Value)) {
    return [IO.Path]::GetFullPath($Value)
  }
  return [IO.Path]::GetFullPath((Join-Path $RepoRoot $Value))
}

function Assert-Within([string]$Value, [string]$Root, [string]$Label) {
  $Full = Resolve-FullPath $Value
  $Prefix = $Root.TrimEnd('\') + '\'
  if (-not $Full.StartsWith($Prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "$Label must stay under $Root"
  }
  return $Full
}

$Config = Resolve-FullPath $Config
$Credentials = Assert-Within $Credentials $PrivateRoot "Credentials"
$History = Assert-Within $History $PrivateRoot "History"
$Output = Assert-Within $Output $TmpRoot "JSON output"
$ReportOutput = Assert-Within $ReportOutput $TmpRoot "Report output"

if (-not (Test-Path -LiteralPath $Config -PathType Leaf)) {
  throw "GSC monitor config is missing."
}
if (-not (Test-Path -LiteralPath $Credentials -PathType Leaf)) {
  throw "GSC authorized-user credential is missing. Complete read-only OAuth first."
}

if (-not [string]::IsNullOrWhiteSpace($ProxyUrl)) {
  $env:HTTPS_PROXY = $ProxyUrl
  $env:HTTP_PROXY = $ProxyUrl
  $UseEnvProxy = $true
}
if ($UseEnvProxy) {
  $ExistingNodeOptions = [string]$env:NODE_OPTIONS
  if ($ExistingNodeOptions -notmatch '(^|\s)--use-env-proxy(\s|$)') {
    $env:NODE_OPTIONS = (($ExistingNodeOptions, "--use-env-proxy") | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join " "
  }
}

$Npm = Get-Command npm.cmd -ErrorAction Stop
Push-Location $RepoRoot
try {
  & $Npm.Source run gsc:check -- `
    --config $Config `
    --credentials $Credentials `
    --history $History `
    --json `
    --output $Output `
    --report-output $ReportOutput `
    --strict
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
