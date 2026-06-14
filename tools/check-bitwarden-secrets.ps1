param(
  [string]$ProjectId = $env:AI_LINK_BWS_PROJECT_ID,
  [switch]$Strict
)

$ErrorActionPreference = "Stop"
$errors = @()

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

function Report($name, $ok, $detail) {
  $status = if ($ok) { "ok" } else { "missing" }
  Write-Host ("{0}: {1} - {2}" -f $name, $status, $detail)
}

$bwsPath = Resolve-BwsPath
if ($bwsPath) {
  $version = & $bwsPath --version
  Report "bws" $true "$version ($bwsPath)"
} else {
  Report "bws" $false "install Bitwarden Secrets Manager CLI"
  $errors += "bws"
}

if ([string]::IsNullOrWhiteSpace($ProjectId)) {
  Report "AI_LINK_BWS_PROJECT_ID" $false "set the non-sensitive Bitwarden project id"
  $errors += "project-id"
} else {
  Report "AI_LINK_BWS_PROJECT_ID" $true $ProjectId
}

if ([string]::IsNullOrWhiteSpace($env:BWS_ACCESS_TOKEN)) {
  Report "BWS_ACCESS_TOKEN" $false "set it only in the current local session"
  $errors += "access-token"
} else {
  Report "BWS_ACCESS_TOKEN" $true "present in current session"
}

if ($bwsPath -and -not [string]::IsNullOrWhiteSpace($env:BWS_ACCESS_TOKEN)) {
  try {
    if ([string]::IsNullOrWhiteSpace($ProjectId)) {
      & $bwsPath project list | Out-Null
      Report "Bitwarden auth" $true "project list succeeded"
    } else {
      & $bwsPath project get $ProjectId | Out-Null
      Report "Bitwarden auth" $true "project access succeeded"
    }
  } catch {
    Report "Bitwarden auth" $false "authentication or project access failed"
    $errors += "auth"
  }
} else {
  Report "Bitwarden auth" $false "skipped until bws and BWS_ACCESS_TOKEN are present"
  if ($Strict) {
    $errors += "auth-skipped"
  }
}

if ($Strict -and $errors.Count -gt 0) {
  exit 1
}

if ($errors.Count -gt 0) {
  Write-Host "BWS mode is not fully ready yet."
  exit 0
}

Write-Host "BWS mode is ready."
