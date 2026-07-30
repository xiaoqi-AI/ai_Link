param(
  [ValidatePattern('^([01]\d|2[0-3]):[0-5]\d$')]
  [string]$At = "13:00",
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

function Get-LocalFileStatus {
  param([string]$Path)

  $Item = Get-Item -LiteralPath $Path -ErrorAction SilentlyContinue
  if (-not $Item) {
    return [ordered]@{
      exists = $false
      path = $Path
      lastWriteTime = $null
      ageHours = $null
      length = $null
    }
  }

  return [ordered]@{
    exists = $true
    path = $Path
    lastWriteTime = $Item.LastWriteTime.ToString("o")
    ageHours = [Math]::Round(((Get-Date) - $Item.LastWriteTime).TotalHours, 1)
    length = $Item.Length
  }
}

function Add-GscIssueCodes {
  param(
    [System.Collections.Generic.List[string]]$Codes,
    [object]$Items
  )

  if ($null -eq $Items) {
    return
  }

  foreach ($Item in @($Items)) {
    if ($null -eq $Item) {
      continue
    }
    if (($Item.PSObject.Properties.Name -contains "code") -and -not [string]::IsNullOrWhiteSpace([string]$Item.code)) {
      $Codes.Add([string]$Item.code)
    }
    if ($Item.PSObject.Properties.Name -contains "issues") {
      Add-GscIssueCodes -Codes $Codes -Items $Item.issues
    }
  }
}

function Read-GscCheckSummary {
  param([string]$Path)

  $Item = Get-Item -LiteralPath $Path -ErrorAction SilentlyContinue
  if (-not $Item) {
    return $null
  }

  try {
    $Check = Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | ConvertFrom-Json
  } catch {
    return [ordered]@{
      exists = $true
      readable = $false
      path = $Path
      lastWriteTime = $Item.LastWriteTime.ToString("o")
      parseError = "failed_to_parse_json"
    }
  }

  $Codes = New-Object 'System.Collections.Generic.List[string]'
  Add-GscIssueCodes -Codes $Codes -Items $Check.googleApi.errors
  Add-GscIssueCodes -Codes $Codes -Items $Check.globalIssues
  Add-GscIssueCodes -Codes $Codes -Items $Check.alerts
  $UniqueCodes = @($Codes | Select-Object -Unique)

  return [ordered]@{
    exists = $true
    readable = $true
    path = $Path
    lastWriteTime = $Item.LastWriteTime.ToString("o")
    checkedAt = $Check.checkedAt
    totalUrls = $Check.summary.totalUrls
    publicReady = $Check.summary.publicReady
    requiresManualAction = $Check.summary.requiresManualAction
    errorCodes = $UniqueCodes
    oauthRefreshFailed = $UniqueCodes -contains "gsc_oauth_refresh_failed"
    propertyNotListed = $UniqueCodes -contains "gsc_property_not_listed"
  }
}

$CredentialFile = Get-LocalFileStatus -Path $Credentials
$CurrentCheck = Join-Path $RepoRoot "runtime\tmp\gsc-current-check.json"
$CandidateCheckItems = @($Output, $CurrentCheck) |
  Select-Object -Unique |
  ForEach-Object { Get-Item -LiteralPath $_ -ErrorAction SilentlyContinue } |
  Where-Object { $null -ne $_ } |
  Sort-Object LastWriteTime -Descending
$LatestCheck = $null
if (@($CandidateCheckItems).Count -gt 0) {
  $LatestCheck = Read-GscCheckSummary -Path @($CandidateCheckItems)[0].FullName
}

$CredentialHealth = "missing"
if ($CredentialFile.exists) {
  $CredentialHealth = "present_unverified"
  if ($LatestCheck -and $LatestCheck.readable) {
    if ($LatestCheck.oauthRefreshFailed) {
      $CredentialHealth = "oauth_refresh_failed"
    } elseif ($LatestCheck.propertyNotListed) {
      $CredentialHealth = "property_not_listed"
    } elseif ($LatestCheck.requiresManualAction -eq $false) {
      $CredentialHealth = "usable_last_check"
    } else {
      $CredentialHealth = "present_needs_review"
    }
  }
}

$OperatorAction = switch ($CredentialHealth) {
  "missing" { "Run gsc:authorize or gsc:recover before applying the schedule." }
  "oauth_refresh_failed" { "Run npm.cmd run gsc:recover -- -ProxyUrl `"http://127.0.0.1:4780`" -ManualCallbackUrl, then rerun gsc:schedule:plan." }
  "property_not_listed" { "Confirm the Google account can access the configured Search Console Domain Property, then rerun gsc:recover." }
  "usable_last_check" { "No GSC OAuth action is required based on the latest local check." }
  "present_needs_review" { "Review the latest local GSC report before enabling unattended monitoring." }
  default { "Credential file exists, but no recent private GSC check proves it is usable; run gsc:check or gsc:recover." }
}
$CredentialKnownInvalid = @("oauth_refresh_failed", "property_not_listed") -contains $CredentialHealth

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
  credentialReady = $CredentialFile.exists
  credentialHealth = $CredentialHealth
  credentialFile = $CredentialFile
  latestCheck = $LatestCheck
  operatorAction = $OperatorAction
  configReady = Test-Path -LiteralPath $Config -PathType Leaf
  applyReady = ($CredentialFile.exists -and (-not $CredentialKnownInvalid) -and (Test-Path -LiteralPath $Config -PathType Leaf))
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
if ($CredentialKnownInvalid) {
  throw "Read-only OAuth credential is present but not usable (credentialHealth=$CredentialHealth). $OperatorAction"
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
