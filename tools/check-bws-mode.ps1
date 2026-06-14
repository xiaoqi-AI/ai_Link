param(
  [string]$ProjectId = $env:AI_LINK_BWS_PROJECT_ID,
  [string]$Repository = "xiaoqi-AI/ai_Link",
  [switch]$CheckRemote,
  [switch]$RunProviderLive,
  [switch]$Strict
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$steps = New-Object System.Collections.Generic.List[object]

function Add-Step {
  param([string]$Name, [string]$Status, [string]$Detail)
  $steps.Add([ordered]@{
    name = $Name
    status = $Status
    detail = $Detail
  }) | Out-Null
}

function Invoke-ToolStep {
  param(
    [string]$Name,
    [scriptblock]$Command,
    [bool]$Required = $true
  )

  Write-Host ""
  Write-Host "== $Name =="

  try {
    & $Command
    $code = if ($null -ne $global:LASTEXITCODE) { [int]$global:LASTEXITCODE } else { 0 }
  } catch {
    Write-Host $_.Exception.Message
    $code = 1
  }

  if ($code -eq 0) {
    Add-Step $Name "pass" "completed"
    return
  }

  if ($Required -or $Strict) {
    Add-Step $Name "fail" "exit code $code"
  } else {
    Add-Step $Name "warn" "not ready yet; exit code $code"
  }
}

function Invoke-PowerShellFile {
  param([string]$Path, [string[]]$Arguments = @())
  & powershell -NoProfile -ExecutionPolicy Bypass -File $Path @Arguments
}

function Invoke-Npm {
  param([string[]]$Arguments)
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) {
    $npm = Get-Command npm -ErrorAction SilentlyContinue
  }
  if (-not $npm) {
    throw "npm was not found."
  }
  & $npm.Source @Arguments
}

Set-Location $root

if (Test-Path -LiteralPath (Join-Path $PSScriptRoot "with-bitwarden-secrets.ps1")) {
  Add-Step "BWS run wrapper" "pass" "npm run bws:run can wrap approved AI Link commands"
} else {
  Add-Step "BWS run wrapper" "fail" "tools/with-bitwarden-secrets.ps1 was not found"
}

$bitwardenArgs = @()
if ($ProjectId) {
  $bitwardenArgs += @("-ProjectId", $ProjectId)
}
$bitwardenArgs += "-Strict"
Invoke-ToolStep "Local Bitwarden Secrets Manager readiness" {
  Invoke-PowerShellFile (Join-Path $PSScriptRoot "check-bitwarden-secrets.ps1") $bitwardenArgs
} -Required:$false

$githubArgs = @("-Repository", $Repository)
if ($CheckRemote) {
  $githubArgs += "-CheckRemote"
  $githubArgs += "-Strict"
}
Invoke-ToolStep "GitHub provider-live BWS wiring" {
  Invoke-PowerShellFile (Join-Path $PSScriptRoot "check-github-provider-live.ps1") $githubArgs
} -Required:$true

Invoke-ToolStep "Public config and sensitive content scan" {
  Invoke-Npm @("run", "security:scan")
} -Required:$true

Invoke-ToolStep "Project governance files" {
  Invoke-PowerShellFile (Join-Path $PSScriptRoot "check-governance.ps1")
} -Required:$true

if ($RunProviderLive) {
  Invoke-ToolStep "Provider live verification with BWS injection" {
    Invoke-PowerShellFile (Join-Path $PSScriptRoot "with-bitwarden-secrets.ps1") @(
      "-ProjectId",
      $ProjectId,
      "-CommandLine",
      "npm run providers:live"
    )
  } -Required:$Strict
} else {
  Add-Step "Provider live verification with BWS injection" "skip" "pass -RunProviderLive after confirming external model cost boundaries"
}

$failed = @($steps | Where-Object { $_.status -eq "fail" })
$warnings = @($steps | Where-Object { $_.status -eq "warn" })

Write-Host ""
Write-Host "== BWS mode summary =="
foreach ($step in $steps) {
  Write-Host ("{0}: {1} - {2}" -f $step.name, $step.status, $step.detail)
}

$summary = [ordered]@{
  ok = $failed.Count -eq 0 -and ($Strict -eq $false -or $warnings.Count -eq 0)
  strict = [bool]$Strict
  checkRemote = [bool]$CheckRemote
  runProviderLive = [bool]$RunProviderLive
  failed = $failed.Count
  warnings = $warnings.Count
  steps = $steps
}

Write-Host ""
$summary | ConvertTo-Json -Depth 6

if ($failed.Count -gt 0 -or ($Strict -and $warnings.Count -gt 0)) {
  exit 1
}
