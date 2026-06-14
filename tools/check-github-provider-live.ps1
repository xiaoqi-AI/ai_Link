param(
  [string]$WorkflowPath = ".github/workflows/provider-live.yml",
  [string]$ManifestPath = ".ai-link/bitwarden-secrets.manifest.json",
  [string]$EnvironmentKey = "providerLive",
  [switch]$Strict
)

$ErrorActionPreference = "Stop"
$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
  param([string]$Name, [string]$Status, [string]$Detail)
  $results.Add([ordered]@{
    name = $Name
    status = $Status
    detail = $Detail
  }) | Out-Null
}

function Test-Contains {
  param([string]$Text, [string]$Needle)
  return $Text.Contains($Needle)
}

if (-not (Test-Path -LiteralPath $ManifestPath)) {
  Add-Result "manifest" "fail" "$ManifestPath is missing."
} else {
  $manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $ManifestPath | ConvertFrom-Json
  $environment = $manifest.githubEnvironments.$EnvironmentKey
  if (-not $environment) {
    Add-Result "manifest environment" "fail" "$EnvironmentKey is missing from $ManifestPath."
  } else {
    Add-Result "manifest environment" "pass" "$ManifestPath#$EnvironmentKey"
  }
}

if (-not (Test-Path -LiteralPath $WorkflowPath)) {
  Add-Result "workflow" "fail" "$WorkflowPath is missing."
} else {
  $workflow = Get-Content -Raw -Encoding UTF8 -LiteralPath $WorkflowPath
  Add-Result "workflow" "pass" "$WorkflowPath exists."

  if ($environment) {
    if ($workflow -match "(?m)^\s*environment:\s*$([regex]::Escape($environment.name))\s*$") {
      Add-Result "GitHub environment" "pass" "Workflow targets $($environment.name)."
    } else {
      Add-Result "GitHub environment" "fail" "Workflow must target environment $($environment.name)."
    }

    if (Test-Contains $workflow "secrets.$($environment.bootstrapSecret)") {
      Add-Result "bootstrap secret" "pass" "Workflow uses $($environment.bootstrapSecret)."
    } else {
      Add-Result "bootstrap secret" "fail" "Workflow must use secrets.$($environment.bootstrapSecret)."
    }

    if (Test-Contains $workflow "bitwarden/sm-action@v2") {
      Add-Result "Bitwarden action" "pass" "Workflow uses bitwarden/sm-action@v2."
    } else {
      Add-Result "Bitwarden action" "fail" "Workflow must use bitwarden/sm-action@v2."
    }

    $secretIdVariables = $environment.secretIdVariables.PSObject.Properties
    foreach ($entry in $secretIdVariables) {
      $secretKey = $entry.Name
      $variableName = [string]$entry.Value
      if (Test-Contains $workflow "vars.$variableName") {
        Add-Result "GitHub variable $variableName" "pass" "Maps Bitwarden secret id to $secretKey."
      } else {
        Add-Result "GitHub variable $variableName" "fail" "Workflow does not reference vars.$variableName."
      }
    }

    $directProviderSecretRefs = @()
    foreach ($entry in $secretIdVariables) {
      $secretKey = $entry.Name
      $directRef = "secrets.$secretKey"
      if (Test-Contains $workflow $directRef) {
        $directProviderSecretRefs += $directRef
      }
    }

    if ($directProviderSecretRefs.Count -eq 0) {
      Add-Result "provider API key storage" "pass" "Workflow does not read provider API keys directly from GitHub Secrets."
    } else {
      Add-Result "provider API key storage" "fail" ("Direct provider GitHub Secret references found: " + ($directProviderSecretRefs -join ", "))
    }
  }
}

$failed = @($results | Where-Object { $_.status -eq "fail" })
$warnings = @($results | Where-Object { $_.status -eq "warn" })
$summary = [ordered]@{
  ok = $failed.Count -eq 0
  failed = $failed.Count
  warnings = $warnings.Count
  results = $results
}

$summary | ConvertTo-Json -Depth 6

if ($failed.Count -gt 0 -or ($Strict -and $warnings.Count -gt 0)) {
  exit 1
}
