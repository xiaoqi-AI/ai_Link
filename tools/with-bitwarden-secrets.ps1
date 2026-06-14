param(
  [string]$ProjectId = $env:AI_LINK_BWS_PROJECT_ID,
  [string]$CommandLine = "npm run ai-link -- doctor",
  [switch]$NoInheritEnv,
  [string]$Shell
)

$ErrorActionPreference = "Stop"

function Fail($message) {
  Write-Error $message
  exit 1
}

if (-not (Get-Command bws -ErrorAction SilentlyContinue)) {
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

Write-Host "Running command with Bitwarden Secrets Manager project: $ProjectId"
& bws @bwsArgs
exit $LASTEXITCODE
