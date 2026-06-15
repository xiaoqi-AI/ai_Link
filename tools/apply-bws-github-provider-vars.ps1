param(
  [string]$ProjectId = $env:AI_LINK_BWS_CI_PROJECT_ID,
  [string]$ManifestPath = ".ai-link/bitwarden-secrets.manifest.json",
  [string]$EnvironmentKey = "providerLive",
  [string]$Repository = "xiaoqi-AI/ai_Link",
  [string]$GitHubToken = "",
  [switch]$Apply,
  [switch]$Plan,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

function Show-Help {
  Write-Host @"
BWS GitHub provider-live variable applier

Usage:
  powershell -ExecutionPolicy Bypass -File tools/apply-bws-github-provider-vars.ps1 -Plan
  powershell -ExecutionPolicy Bypass -File tools/apply-bws-github-provider-vars.ps1 -Apply

Default:
  Prints a non-secret plan. Nothing is written unless -Apply is passed.

Apply mode:
  1. Reads Bitwarden secret IDs from the configured CI project.
  2. Writes GitHub Environment Variables such as BWS_DEEPSEEK_API_KEY_SECRET_ID.
  3. Does not create or update the BW_ACCESS_TOKEN Environment Secret.

Required for -Apply:
  - AI_LINK_BWS_CI_PROJECT_ID or -ProjectId
  - BWS_ACCESS_TOKEN in the current session
  - GH_TOKEN, GITHUB_TOKEN, or -GitHubToken with environment variable write access

Safety:
  - Token values are never printed.
  - Bitwarden secret values are never read or printed.
  - GitHub variable values are Bitwarden secret IDs, not provider API keys.
"@
}

function Fail($message) {
  Write-Error $message
  exit 1
}

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

function Get-GitHubToken {
  if ($GitHubToken) {
    return $GitHubToken
  }
  if ($env:GH_TOKEN) {
    return $env:GH_TOKEN
  }
  if ($env:GITHUB_TOKEN) {
    return $env:GITHUB_TOKEN
  }
  return ""
}

function Invoke-GitHubJson {
  param(
    [string]$Path,
    [string]$Method = "GET",
    [string]$Token,
    [object]$Body = $null
  )

  $headers = @{
    "Accept" = "application/vnd.github+json"
    "User-Agent" = "ai-link-bws-github-vars"
    "X-GitHub-Api-Version" = "2022-11-28"
  }
  if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
  }

  $parameters = @{
    Method = $Method
    Uri = "https://api.github.com$Path"
    Headers = $headers
  }

  if ($null -ne $Body) {
    $parameters["ContentType"] = "application/json"
    $parameters["Body"] = ($Body | ConvertTo-Json -Depth 8 -Compress)
  }

  return Invoke-RestMethod @parameters
}

function Collect-Secrets($value) {
  $items = @()
  if ($null -eq $value) {
    return $items
  }

  if ($value -is [System.Array]) {
    foreach ($item in $value) {
      $items += Collect-Secrets $item
    }
    return $items
  }

  $propertyNames = @($value.PSObject.Properties.Name)
  $name = $null
  if ($propertyNames -contains "key") {
    $name = [string]$value.key
  } elseif ($propertyNames -contains "name") {
    $name = [string]$value.name
  }

  if ($name -and ($propertyNames -contains "id")) {
    $items += [pscustomobject]@{
      name = $name
      id = [string]$value.id
    }
  }

  if ($propertyNames -contains "data") {
    $items += Collect-Secrets $value.data
  }
  if ($propertyNames -contains "items") {
    $items += Collect-Secrets $value.items
  }

  return $items
}

function New-VariablePlan {
  param($Environment)

  $items = New-Object System.Collections.Generic.List[object]
  foreach ($secretVariable in $Environment.secretIdVariables.PSObject.Properties) {
    $items.Add([ordered]@{
      secretKey = [string]$secretVariable.Name
      githubVariable = [string]$secretVariable.Value
    }) | Out-Null
  }
  return $items
}

if ($Help) {
  Show-Help
  exit 0
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not (Test-Path -LiteralPath $ManifestPath)) {
  Fail "Manifest not found: $ManifestPath"
}

$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $ManifestPath | ConvertFrom-Json
$environment = $manifest.githubEnvironments.$EnvironmentKey
if (-not $environment) {
  Fail "GitHub environment '$EnvironmentKey' was not found in $ManifestPath."
}

$variablePlan = @(New-VariablePlan -Environment $environment)

if ($Plan -or -not $Apply) {
  Write-Host "BWS GitHub provider-live variable apply plan"
  Write-Host ""
  Write-Host "Repository: $Repository"
  Write-Host "Environment: $($environment.name)"
  Write-Host "Bootstrap Environment Secret: $($environment.bootstrapSecret) (manual secret setup; value not handled here)"
  Write-Host ""
  Write-Host "Variables to apply from Bitwarden secret IDs:"
  foreach ($item in $variablePlan) {
    Write-Host ("- {0} -> {1}" -f $item.secretKey, $item.githubVariable)
  }
  Write-Host ""
  Write-Host "No credentials or secret values are required for this plan output."
  Write-Host "Run with -Apply only after BWS_ACCESS_TOKEN and GH_TOKEN/GITHUB_TOKEN are present in the current session."
  exit 0
}

if ([string]::IsNullOrWhiteSpace($ProjectId)) {
  Fail "Missing Bitwarden CI project id. Pass -ProjectId or set AI_LINK_BWS_CI_PROJECT_ID."
}

if ([string]::IsNullOrWhiteSpace($env:BWS_ACCESS_TOKEN)) {
  Fail "Missing BWS_ACCESS_TOKEN in the current session. Do not write it into project files."
}

$token = Get-GitHubToken
if ([string]::IsNullOrWhiteSpace($token)) {
  Fail "Missing GitHub token. Set GH_TOKEN/GITHUB_TOKEN only in the current session or pass -GitHubToken."
}

$bwsPath = Resolve-BwsPath
if (-not $bwsPath) {
  Fail "Bitwarden Secrets Manager CLI (bws) was not found."
}

$rawSecrets = & $bwsPath secret list $ProjectId --output json
$secretItems = @(Collect-Secrets ($rawSecrets | ConvertFrom-Json))
$secretIdsByName = @{}
foreach ($item in $secretItems) {
  if (-not $secretIdsByName.ContainsKey($item.name)) {
    $secretIdsByName[$item.name] = New-Object System.Collections.Generic.List[string]
  }
  $secretIdsByName[$item.name].Add($item.id) | Out-Null
}

$missing = @()
$updates = @()
foreach ($item in $variablePlan) {
  if (-not $secretIdsByName.ContainsKey($item.secretKey)) {
    $missing += $item.secretKey
    continue
  }
  $ids = @($secretIdsByName[$item.secretKey])
  if ($ids.Count -ne 1) {
    $missing += $item.secretKey
    continue
  }
  $updates += [pscustomobject]@{
    name = $item.githubVariable
    value = [string]$ids[0]
    secretKey = $item.secretKey
  }
}

if ($missing.Count -gt 0) {
  Fail ("Missing or ambiguous Bitwarden secret IDs: " + ($missing -join ", "))
}

$encodedEnvironmentName = [uri]::EscapeDataString([string]$environment.name)
$environmentPath = "/repos/$Repository/environments/$encodedEnvironmentName"

try {
  Invoke-GitHubJson -Path $environmentPath -Method "PUT" -Token $token -Body ([ordered]@{}) | Out-Null
} catch {
  Fail "Could not create or update GitHub environment '$($environment.name)' in $Repository."
}

$existingNames = @()
try {
  $variablesResponse = Invoke-GitHubJson -Path "$environmentPath/variables?per_page=100" -Token $token
  $existingNames = @($variablesResponse.variables | ForEach-Object { [string]$_.name })
} catch {
  Fail "Could not list GitHub Environment variables for '$($environment.name)'."
}

$results = New-Object System.Collections.Generic.List[object]
foreach ($update in $updates) {
  try {
    $encodedVariableName = [uri]::EscapeDataString([string]$update.name)
    if ($existingNames -contains $update.name) {
      Invoke-GitHubJson -Path "$environmentPath/variables/$encodedVariableName" -Method "PATCH" -Token $token -Body ([ordered]@{
        name = $update.name
        value = $update.value
      }) | Out-Null
      $status = "updated"
    } else {
      Invoke-GitHubJson -Path "$environmentPath/variables" -Method "POST" -Token $token -Body ([ordered]@{
        name = $update.name
        value = $update.value
      }) | Out-Null
      $status = "created"
    }

    $results.Add([ordered]@{
      variable = $update.name
      secretKey = $update.secretKey
      status = $status
      value = "not printed"
    }) | Out-Null
  } catch {
    $results.Add([ordered]@{
      variable = $update.name
      secretKey = $update.secretKey
      status = "failed"
      value = "not printed"
    }) | Out-Null
  }
}

$failed = @($results | Where-Object { $_.status -eq "failed" })
$summary = [ordered]@{
  ok = $failed.Count -eq 0
  repository = $Repository
  environment = $environment.name
  bootstrapSecret = $environment.bootstrapSecret
  bootstrapSecretAction = "set manually as a GitHub Environment Secret"
  variables = $results
}

$summary | ConvertTo-Json -Depth 8

if ($failed.Count -gt 0) {
  exit 1
}
