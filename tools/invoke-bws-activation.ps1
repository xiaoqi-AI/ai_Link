param(
  [string]$ProjectId = $env:AI_LINK_BWS_PROJECT_ID,
  [string]$CiProjectId = $env:AI_LINK_BWS_CI_PROJECT_ID,
  [string]$Repository = "xiaoqi-AI/ai_Link",
  [switch]$SkipCi,
  [switch]$CheckRemote,
  [switch]$RunDoctor,
  [switch]$RunProviderLive,
  [switch]$Plan,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

function Show-Help {
  Write-Host @"
BWS activation wizard

Usage:
  powershell -ExecutionPolicy Bypass -File tools/invoke-bws-activation.ps1
  powershell -ExecutionPolicy Bypass -File tools/invoke-bws-activation.ps1 -Plan

Default:
  Guides a post-configuration activation in two scoped token phases:

    1. Local Codex token for ai-link-local-dev.
    2. GitHub Actions token for ai-link-ci.

Examples:
  npm run bws:activate:plan
  npm run bws:activate
  powershell -ExecutionPolicy Bypass -File tools/invoke-bws-activation.ps1 -RunDoctor
  powershell -ExecutionPolicy Bypass -File tools/invoke-bws-activation.ps1 -CheckRemote

Safety:
  - Tokens are read with hidden prompts and only set for child commands.
  - BWS_ACCESS_TOKEN is restored after each phase.
  - Provider live verification is skipped unless -RunProviderLive is passed.
"@
}

function Fail($message) {
  Write-Error $message
  exit 1
}

function ConvertFrom-SecretString {
  param([Security.SecureString]$SecureValue)

  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Restore-EnvVar {
  param(
    [string]$Name,
    [bool]$HadValue,
    [string]$OldValue
  )

  if ($HadValue) {
    Set-Item -Path "Env:$Name" -Value $OldValue
  } else {
    Remove-Item -Path "Env:$Name" -ErrorAction SilentlyContinue
  }
}

function Read-HiddenToken {
  param([string]$Prompt)
  $secureToken = Read-Host $Prompt -AsSecureString
  $token = ConvertFrom-SecretString $secureToken
  if ([string]::IsNullOrWhiteSpace($token)) {
    Fail "Missing token for $Prompt."
  }
  return $token
}

function Invoke-Step {
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
  } elseif ($Required) {
    Add-Step $Name "fail" "exit code $code"
  } else {
    Add-Step $Name "warn" "not completed; exit code $code"
  }
}

function Add-Step {
  param([string]$Name, [string]$Status, [string]$Detail)
  $script:steps.Add([ordered]@{
    name = $Name
    status = $Status
    detail = $Detail
  }) | Out-Null
}

function Invoke-PowerShellFile {
  param([string]$Path, [string[]]$Arguments = @())
  & powershell -NoProfile -ExecutionPolicy Bypass -File $Path @Arguments
}

if ($Help) {
  Show-Help
  exit 0
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if ($Plan) {
  Write-Host "BWS activation plan"
  Write-Host ""
  Write-Host "1. Load or create non-secret project IDs:"
  Write-Host "   - AI_LINK_BWS_PROJECT_ID for ai-link-local-dev"
  Write-Host "   - AI_LINK_BWS_CI_PROJECT_ID for ai-link-ci"
  Write-Host "2. Prompt hidden local Codex machine-account token."
  Write-Host "3. Run strict local-dev secret readiness."
  Write-Host "4. Optionally run doctor through bws run."
  Write-Host "5. Prompt hidden GitHub Actions machine-account token."
  Write-Host "6. Generate GitHub provider-live variable worksheet from CI project secret IDs."
  Write-Host "7. Optionally check remote GitHub Environment names when GH_TOKEN/GITHUB_TOKEN is present."
  Write-Host "8. Keep provider live verification disabled unless -RunProviderLive is explicitly passed."
  Write-Host ""
  Write-Host "No token is required for this plan output."
  exit 0
}

if ([string]::IsNullOrWhiteSpace($ProjectId)) {
  $ProjectId = Read-Host "Bitwarden project id (ai-link-local-dev)"
}
if ([string]::IsNullOrWhiteSpace($ProjectId)) {
  Fail "Missing ai-link-local-dev Bitwarden project id."
}

if (-not $SkipCi -and [string]::IsNullOrWhiteSpace($CiProjectId)) {
  $CiProjectId = Read-Host "Bitwarden project id (ai-link-ci)"
}
if (-not $SkipCi -and [string]::IsNullOrWhiteSpace($CiProjectId)) {
  Fail "Missing ai-link-ci Bitwarden project id. Pass -SkipCi to activate local-only."
}

$hadProjectId = Test-Path Env:\AI_LINK_BWS_PROJECT_ID
$oldProjectId = $env:AI_LINK_BWS_PROJECT_ID
$hadCiProjectId = Test-Path Env:\AI_LINK_BWS_CI_PROJECT_ID
$oldCiProjectId = $env:AI_LINK_BWS_CI_PROJECT_ID
$hadToken = Test-Path Env:\BWS_ACCESS_TOKEN
$oldToken = $env:BWS_ACCESS_TOKEN
$steps = New-Object System.Collections.Generic.List[object]
$localToken = $null
$ciToken = $null

try {
  $env:AI_LINK_BWS_PROJECT_ID = $ProjectId
  $env:AI_LINK_BWS_CI_PROJECT_ID = $CiProjectId

  $localToken = Read-HiddenToken "BWS_ACCESS_TOKEN for ma-ai-link-local-codex (hidden)"
  $env:BWS_ACCESS_TOKEN = $localToken

  Invoke-Step "Local Bitwarden strict readiness" {
    Invoke-PowerShellFile (Join-Path $PSScriptRoot "check-bitwarden-secrets.ps1") @("-ProjectId", $ProjectId, "-Strict")
  }

  if ($RunDoctor) {
    Invoke-Step "AI Link doctor through local BWS project" {
      Invoke-PowerShellFile (Join-Path $PSScriptRoot "with-bitwarden-secrets.ps1") @("-ProjectId", $ProjectId, "-CommandLine", "npm run ai-link -- doctor")
    }
  } else {
    Add-Step "AI Link doctor through local BWS project" "skip" "pass -RunDoctor after local strict readiness succeeds"
  }

  if ($RunProviderLive) {
    Invoke-Step "Provider live verification through local BWS project" {
      Invoke-PowerShellFile (Join-Path $PSScriptRoot "with-bitwarden-secrets.ps1") @("-ProjectId", $ProjectId, "-CommandLine", "npm run providers:live")
    }
  } else {
    Add-Step "Provider live verification through local BWS project" "skip" "pass -RunProviderLive only after confirming model cost boundaries"
  }

  if (-not $SkipCi) {
    $env:BWS_ACCESS_TOKEN = ""
    $ciToken = Read-HiddenToken "BWS_ACCESS_TOKEN for ma-ai-link-github-actions (hidden)"
    $env:BWS_ACCESS_TOKEN = $ciToken

    Invoke-Step "BWS GitHub provider-live variable IDs" {
      Invoke-PowerShellFile (Join-Path $PSScriptRoot "export-bws-github-provider-vars.ps1") @("-ProjectId", $CiProjectId, "-Force")
    }

    if ($CheckRemote) {
      Invoke-Step "Remote GitHub provider-live Environment" {
        Invoke-PowerShellFile (Join-Path $PSScriptRoot "check-github-provider-live.ps1") @("-Repository", $Repository, "-CheckRemote", "-Strict")
      }
    } else {
      Add-Step "Remote GitHub provider-live Environment" "skip" "pass -CheckRemote when GH_TOKEN/GITHUB_TOKEN can read repository environments"
    }
  } else {
    Add-Step "BWS GitHub provider-live variable IDs" "skip" "local-only activation"
    Add-Step "Remote GitHub provider-live Environment" "skip" "local-only activation"
  }
} finally {
  Restore-EnvVar "AI_LINK_BWS_PROJECT_ID" $hadProjectId $oldProjectId
  Restore-EnvVar "AI_LINK_BWS_CI_PROJECT_ID" $hadCiProjectId $oldCiProjectId
  Restore-EnvVar "BWS_ACCESS_TOKEN" $hadToken $oldToken
  $localToken = $null
  $ciToken = $null
}

$failed = @($steps | Where-Object { $_.status -eq "fail" })

Write-Host ""
Write-Host "== BWS activation summary =="
foreach ($step in $steps) {
  Write-Host ("{0}: {1} - {2}" -f $step.name, $step.status, $step.detail)
}

Write-Host ""
if ($failed.Count -eq 0) {
  Write-Host "BWS activation checks completed without failed steps."
  Write-Host "Next: run npm run bws:acceptance:strict in a scoped session, then npm run bws:doctor."
} else {
  Write-Host "BWS activation has failed steps. Fix them before using BWS-backed live automation."
  exit 1
}
