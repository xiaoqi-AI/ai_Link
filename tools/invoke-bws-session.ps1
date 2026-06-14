param(
  [string]$ProjectId = $env:AI_LINK_BWS_PROJECT_ID,
  [string]$CommandLine = "npm run bws:check:strict",
  [switch]$UseBwsRun,
  [switch]$NoInheritEnv,
  [string]$Shell,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

function Show-Help {
  Write-Host @"
BWS scoped session runner

Usage:
  powershell -ExecutionPolicy Bypass -File tools/invoke-bws-session.ps1 [-ProjectId <id>] [-CommandLine "<command>"] [-UseBwsRun]

Default:
  Prompts for BWS_ACCESS_TOKEN when it is not already present, sets it only for
  this script's child command, then runs:

    npm run bws:check:strict

Examples:
  npm run bws:session
  npm run bws:doctor
  powershell -ExecutionPolicy Bypass -File tools/invoke-bws-session.ps1 -UseBwsRun -CommandLine "npm run ai-link -- doctor"
  powershell -ExecutionPolicy Bypass -File tools/invoke-bws-session.ps1 -UseBwsRun -CommandLine "npm run ai-link -- run auto_ops.research --dry-run --input ""test"""

Notes:
  - Secret values are never printed by this script.
  - AI_LINK_BWS_PROJECT_ID is non-sensitive and may be stored locally.
  - BWS_ACCESS_TOKEN must not be written into project files, Git, docs, issues,
    pull requests, or the knowledge base.
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

function Invoke-CommandLine {
  param([string]$Line)

  if ([string]::IsNullOrWhiteSpace($Line)) {
    Fail "Missing command line to run."
  }

  $cmd = if ([string]::IsNullOrWhiteSpace($env:ComSpec)) { "cmd.exe" } else { $env:ComSpec }
  & $cmd /d /s /c $Line
  return $LASTEXITCODE
}

if ($Help) {
  Show-Help
  exit 0
}

if ([string]::IsNullOrWhiteSpace($ProjectId)) {
  $ProjectId = Read-Host "Bitwarden project id (ai-link-local-dev)"
}

if ([string]::IsNullOrWhiteSpace($ProjectId)) {
  Fail "Missing Bitwarden project id. Pass -ProjectId or set AI_LINK_BWS_PROJECT_ID."
}

$hadProjectId = Test-Path Env:\AI_LINK_BWS_PROJECT_ID
$oldProjectId = $env:AI_LINK_BWS_PROJECT_ID
$hadToken = Test-Path Env:\BWS_ACCESS_TOKEN
$oldToken = $env:BWS_ACCESS_TOKEN
$token = $env:BWS_ACCESS_TOKEN

if ([string]::IsNullOrWhiteSpace($token)) {
  $secureToken = Read-Host "BWS_ACCESS_TOKEN (input hidden)" -AsSecureString
  $token = ConvertFrom-SecretString $secureToken
}

if ([string]::IsNullOrWhiteSpace($token)) {
  Fail "Missing BWS_ACCESS_TOKEN."
}

$exitCode = 0

try {
  $env:AI_LINK_BWS_PROJECT_ID = $ProjectId
  $env:BWS_ACCESS_TOKEN = $token

  if ($UseBwsRun) {
    $args = @("-ProjectId", $ProjectId, "-CommandLine", $CommandLine)
    if ($NoInheritEnv) {
      $args += "-NoInheritEnv"
    }
    if (-not [string]::IsNullOrWhiteSpace($Shell)) {
      $args += @("-Shell", $Shell)
    }

    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "with-bitwarden-secrets.ps1") @args
    $exitCode = $LASTEXITCODE
  } else {
    Write-Host "Running BWS-scoped command with project: $ProjectId"
    $exitCode = Invoke-CommandLine $CommandLine
  }
} catch {
  Write-Error $_.Exception.Message
  $exitCode = 1
} finally {
  Restore-EnvVar "AI_LINK_BWS_PROJECT_ID" $hadProjectId $oldProjectId
  Restore-EnvVar "BWS_ACCESS_TOKEN" $hadToken $oldToken
  $token = $null
}

exit $exitCode
