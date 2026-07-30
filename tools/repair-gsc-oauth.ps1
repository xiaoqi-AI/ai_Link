param(
  [string]$ClientConfig = "",
  [string]$Credentials = "",
  [string]$Config = "",
  [string]$History = "",
  [string]$Output = "",
  [string]$ReportOutput = "",
  [int]$TimeoutMs = 900000,
  [string]$ProxyUrl = "",
  [switch]$UseEnvProxy,
  [switch]$NoForce
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$PrivateRoot = [IO.Path]::GetFullPath((Join-Path $RepoRoot "runtime\private"))
$TmpRoot = [IO.Path]::GetFullPath((Join-Path $RepoRoot "runtime\tmp"))

if ([string]::IsNullOrWhiteSpace($ClientConfig)) {
  $ClientConfig = Join-Path $PrivateRoot "google-search-console\desktop-client.json"
}
if ([string]::IsNullOrWhiteSpace($Credentials)) {
  $Credentials = Join-Path $PrivateRoot "google-search-console\authorized-user.json"
}
if ([string]::IsNullOrWhiteSpace($Config)) {
  $Config = Join-Path $RepoRoot "examples\google-search-console\voice-site.domain.public.json"
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

if ($TimeoutMs -lt 30000 -or $TimeoutMs -gt 900000) {
  throw "TimeoutMs must be between 30000 and 900000."
}

$ClientConfig = Assert-Within $ClientConfig $PrivateRoot "ClientConfig"
$Credentials = Assert-Within $Credentials $PrivateRoot "Credentials"
$Config = Resolve-FullPath $Config
$History = Assert-Within $History $PrivateRoot "History"
$Output = Assert-Within $Output $TmpRoot "JSON output"
$ReportOutput = Assert-Within $ReportOutput $TmpRoot "Report output"

if (-not (Test-Path -LiteralPath $ClientConfig -PathType Leaf)) {
  throw "GSC Desktop OAuth client config is missing."
}
if (-not (Test-Path -LiteralPath $Config -PathType Leaf)) {
  throw "GSC monitor config is missing."
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
$PowerShell = Get-Command powershell -ErrorAction Stop

Push-Location $RepoRoot
try {
  Write-Host "Step 1/2: opening Google Search Console read-only authorization."
  Write-Host "Use the Google account that can access the configured Search Console property."
  Write-Host "No token, authorization code, or Google response body will be printed."

  $AuthorizeArgs = @(
    "run",
    "gsc:authorize",
    "--",
    "--client-config",
    $ClientConfig,
    "--output",
    $Credentials,
    "--timeout-ms",
    [string]$TimeoutMs
  )
  if (-not $NoForce) {
    $AuthorizeArgs += "--force"
  }

  & $Npm.Source @AuthorizeArgs
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  Write-Host "Step 2/2: running the private Google Search Console monitor."
  $MonitorArgs = @(
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    (Join-Path $RepoRoot "tools\run-gsc-monitor.ps1"),
    "-Config",
    $Config,
    "-Credentials",
    $Credentials,
    "-History",
    $History,
    "-Output",
    $Output,
    "-ReportOutput",
    $ReportOutput
  )
  if (-not [string]::IsNullOrWhiteSpace($ProxyUrl)) {
    $MonitorArgs += @("-ProxyUrl", $ProxyUrl)
  } elseif ($UseEnvProxy) {
    $MonitorArgs += "-UseEnvProxy"
  }

  & $PowerShell.Source @MonitorArgs
  $MonitorExitCode = $LASTEXITCODE
  if ($MonitorExitCode -eq 0) {
    Write-Host "GSC recovery check completed."
    Write-Host "Report: $ReportOutput"
    Write-Host "JSON: $Output"
  }
  exit $MonitorExitCode
} finally {
  Pop-Location
}
