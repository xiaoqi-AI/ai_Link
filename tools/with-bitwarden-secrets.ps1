param(
  [string]$ProjectId = $env:AI_LINK_BWS_PROJECT_ID,
  [string]$CommandLine = "npm run ai-link -- doctor",
  [switch]$NoInheritEnv,
  [string]$Shell,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

function Show-Help {
  Write-Host @"
BWS run wrapper

Usage:
  npm run bws:run -- -CommandLine "<command>"
  powershell -ExecutionPolicy Bypass -File tools/with-bitwarden-secrets.ps1 -CommandLine "<command>"

Default:
  Runs this command through Bitwarden Secrets Manager:

    npm run ai-link -- doctor

Examples:
  npm run bws:run
  npm run bws:run -- -CommandLine "npm run ai-link -- doctor"
  npm run bws:run -- -CommandLine "npm run ai-link -- run auto_ops.research --dry-run --input ""test"""
  npm run bws:run -- -CommandLine "npm run providers:live:safe-report"

Notes:
  - Requires bws, AI_LINK_BWS_PROJECT_ID, and BWS_ACCESS_TOKEN in the current session.
  - Secret values are never printed by this wrapper.
  - BWS_ACCESS_TOKEN must not be written into project files, Git, docs, issues,
    pull requests, screenshots, or the knowledge base.
  - Use bws:session when you want a hidden prompt for BWS_ACCESS_TOKEN.
"@
}

function Fail($message) {
  Write-Error $message
  exit 1
}

function Resolve-BwsPath {
  $command = Get-Command bws -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $defaultPath = Join-Path $env:LOCALAPPDATA "Programs\BitwardenSecretsManager\bin\bws.exe"
  if (Test-Path -LiteralPath $defaultPath) {
    return $defaultPath
  }

  return $null
}

if ($Help) {
  Show-Help
  exit 0
}

$bwsPath = Resolve-BwsPath
if (-not $bwsPath) {
  Fail "Bitwarden Secrets Manager CLI (bws) was not found. Install it first: https://bitwarden.com/help/secrets-manager-cli/"
}

if ([string]::IsNullOrWhiteSpace($ProjectId)) {
  Fail "Missing Bitwarden project id. Pass -ProjectId or set AI_LINK_BWS_PROJECT_ID."
}

if ([string]::IsNullOrWhiteSpace($env:BWS_ACCESS_TOKEN)) {
  Fail "Missing BWS_ACCESS_TOKEN in the current session. Do not write it into project files."
}

if ([string]::IsNullOrWhiteSpace($CommandLine)) {
  Fail "Missing command line to run under bws."
}

$bwsArgs = @("run", "--project-id", $ProjectId)

if ($NoInheritEnv) {
  $bwsArgs += "--no-inherit-env"
}

if (-not [string]::IsNullOrWhiteSpace($Shell)) {
  $bwsArgs += @("--shell", $Shell)
}

$bwsArgs += @("--", $CommandLine)

Write-Host "Running command with Bitwarden Secrets Manager project: present; value not printed"
& $bwsPath @bwsArgs
exit $LASTEXITCODE
