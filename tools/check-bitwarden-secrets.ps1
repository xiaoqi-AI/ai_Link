param(
  [string]$ProjectId = $env:AI_LINK_BWS_PROJECT_ID,
  [string]$ManifestPath = ".ai-link/bitwarden-secrets.manifest.json",
  [string]$ManifestProject = "localDev",
  [string[]]$ExpectedSecretKeys = @(),
  [switch]$Strict
)

$ErrorActionPreference = "Stop"
$errors = @()

function Resolve-BwsPath {
  if (-not [string]::IsNullOrWhiteSpace($env:AI_LINK_BWS_CLI_PATH)) {
    $configuredPath = $env:AI_LINK_BWS_CLI_PATH
    if (-not [System.IO.Path]::IsPathRooted($configuredPath)) {
      $configuredPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $configuredPath))
    }
    if (Test-Path -LiteralPath $configuredPath) {
      return $configuredPath
    }
  }

  $command = Get-Command bws -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) {
    $defaultPath = Join-Path $env:LOCALAPPDATA "Programs\BitwardenSecretsManager\bin\bws.exe"
    if (Test-Path -LiteralPath $defaultPath) {
      return $defaultPath
    }
  }

  return $null
}

function Report($name, $ok, $detail) {
  $status = if ($ok) { "ok" } else { "missing" }
  Write-Host ("{0}: {1} - {2}" -f $name, $status, $detail)
}

function Resolve-ExpectedSecrets {
  $keys = @()

  if ($ExpectedSecretKeys.Count -gt 0) {
    $keys += $ExpectedSecretKeys
  }

  if (-not [string]::IsNullOrWhiteSpace($ManifestPath) -and (Test-Path -LiteralPath $ManifestPath)) {
    $manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $ManifestPath | ConvertFrom-Json
    $project = $manifest.projects.$ManifestProject
    if ($project -and $project.expectedSecretKeys) {
      $keys += @($project.expectedSecretKeys)
      Report "Secret manifest" $true "$ManifestPath#$ManifestProject"
    } else {
      Report "Secret manifest" $false "project '$ManifestProject' was not found in $ManifestPath"
      $script:errors += "manifest-project"
    }
  } elseif (-not [string]::IsNullOrWhiteSpace($ManifestPath)) {
    Report "Secret manifest" $false "$ManifestPath not found"
    $script:errors += "manifest"
  }

  return @($keys | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
}

function Extract-SecretKeys($value) {
  $keys = @()
  if ($null -eq $value) {
    return $keys
  }

  if ($value -is [System.Array]) {
    foreach ($item in $value) {
      $keys += Extract-SecretKeys $item
    }
    return $keys
  }

  if ($value.PSObject.Properties.Name -contains "key") {
    $keys += [string]$value.key
  }
  if ($value.PSObject.Properties.Name -contains "name") {
    $keys += [string]$value.name
  }
  if ($value.PSObject.Properties.Name -contains "data") {
    $keys += Extract-SecretKeys $value.data
  }
  if ($value.PSObject.Properties.Name -contains "items") {
    $keys += Extract-SecretKeys $value.items
  }

  return $keys
}

$bwsPath = Resolve-BwsPath
if ($bwsPath) {
  $version = & $bwsPath --version
  Report "bws" $true "$version"
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

$expectedKeys = Resolve-ExpectedSecrets

if ($bwsPath -and -not [string]::IsNullOrWhiteSpace($env:BWS_ACCESS_TOKEN)) {
  try {
    if ([string]::IsNullOrWhiteSpace($ProjectId)) {
      & $bwsPath project list | Out-Null
      Report "Bitwarden auth" $true "project list succeeded"
    } else {
      & $bwsPath project get $ProjectId | Out-Null
      Report "Bitwarden auth" $true "project access succeeded"

      if ($expectedKeys.Count -gt 0) {
        $rawSecrets = & $bwsPath secret list $ProjectId --output json
        $parsedSecrets = $rawSecrets | ConvertFrom-Json
        $presentKeys = @(Extract-SecretKeys $parsedSecrets | Where-Object { $_ } | Sort-Object -Unique)
        $missingKeys = @($expectedKeys | Where-Object { $presentKeys -notcontains $_ })

        if ($missingKeys.Count -eq 0) {
          Report "Bitwarden secrets" $true "$($expectedKeys.Count) expected keys are present"
        } else {
          Report "Bitwarden secrets" $false ("missing expected keys: " + ($missingKeys -join ", "))
          $errors += "secrets"
        }
      } else {
        Report "Bitwarden secrets" $true "no expected keys configured"
      }
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
