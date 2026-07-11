param(
  [ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')]
  [string]$At = "09:00",
  [ValidatePattern('^[A-Za-z0-9 _.-]{1,80}$')]
  [string]$TaskName = "AI Link GSC Readonly Monitor",
  [string]$ProxyUrl = "",
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$Runner = Join-Path $PSScriptRoot "run-gsc-monitor.ps1"
$Credentials = Join-Path $RepoRoot "runtime\private\google-search-console\authorized-user.json"
$History = Join-Path $RepoRoot "runtime\private\google-search-console\domain-history.json"
$Output = Join-Path $RepoRoot "runtime\tmp\gsc-live-domain-check.json"
$Report = Join-Path $RepoRoot "runtime\tmp\gsc-live-domain-report.md"
$Config = Join-Path $RepoRoot "examples\google-search-console\voice-site.domain.public.json"
$ArgumentList = @(
  "-NoProfile",
  "-NonInteractive",
  "-ExecutionPolicy", "Bypass",
  "-File", ('"' + $Runner + '"'),
  "-Config", ('"' + $Config + '"'),
  "-Credentials", ('"' + $Credentials + '"'),
  "-History", ('"' + $History + '"'),
  "-Output", ('"' + $Output + '"'),
  "-ReportOutput", ('"' + $Report + '"')
)
if (-not [string]::IsNullOrWhiteSpace($ProxyUrl)) {
  $ArgumentList += @("-ProxyUrl", ('"' + $ProxyUrl + '"'))
}
$Arguments = $ArgumentList -join " "

$Plan = [ordered]@{
  mode = if ($Apply) { "apply" } else { "plan" }
  taskName = $TaskName
  schedule = "daily $At local time"
  runAs = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  logonBoundary = "Runs only while the current user has an interactive session."
  credentialReady = Test-Path -LiteralPath $Credentials -PathType Leaf
  configReady = Test-Path -LiteralPath $Config -PathType Leaf
  runner = $Runner
  output = $Output
  report = $Report
  history = $History
  proxy = if ([string]::IsNullOrWhiteSpace($ProxyUrl)) { "not configured" } else { "configured" }
  safety = @(
    "Uses Search Console read-only credentials only.",
    "Stores redacted reports under runtime/tmp and redacted history under runtime/private.",
    "Does not perform Request indexing or sitemap submission.",
    "Plan mode does not create or modify a Windows Scheduled Task."
  )
}

if (-not $Apply) {
  $Plan | ConvertTo-Json -Depth 4
  exit 0
}

if (-not $Plan.credentialReady) {
  throw "Read-only OAuth credential is missing. Run gsc:authorize before applying the schedule."
}
if (-not (Get-Command Register-ScheduledTask -ErrorAction SilentlyContinue)) {
  throw "The Windows ScheduledTasks module is unavailable."
}

$Time = [DateTime]::ParseExact($At, "HH:mm", [Globalization.CultureInfo]::InvariantCulture)
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $Arguments -WorkingDirectory $RepoRoot
$Trigger = New-ScheduledTaskTrigger -Daily -At $Time
$Principal = New-ScheduledTaskPrincipal `
  -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) `
  -LogonType Interactive `
  -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Principal $Principal `
  -Settings $Settings `
  -Description "AI Link read-only Google Search Console monitoring with redacted local reports." `
  -Force | Out-Null

$Plan.applied = $true
$Plan | ConvertTo-Json -Depth 4
