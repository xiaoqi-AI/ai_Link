param(
  [string]$ManifestPath = ".ai-link/bitwarden-secrets.manifest.json",
  [switch]$Json
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ManifestPath)) {
  Write-Error "Manifest not found: $ManifestPath"
  exit 1
}

$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $ManifestPath | ConvertFrom-Json

$plan = [ordered]@{
  mode = $manifest.mode
  organization = $manifest.organization
  bitwardenProjects = @()
  githubEnvironments = @()
  localSession = [ordered]@{
    environmentVariables = @(
      "AI_LINK_BWS_PROJECT_ID=<ai-link-local-dev-project-id>",
      "BWS_ACCESS_TOKEN=<ma-ai-link-local-codex-token>"
    )
    checks = @(
      "npm run bws:check",
      "npm run bws:check:strict"
    )
    runExamples = @(
      'powershell -ExecutionPolicy Bypass -File tools/with-bitwarden-secrets.ps1 -CommandLine "npm run ai-link -- doctor"',
      'powershell -ExecutionPolicy Bypass -File tools/with-bitwarden-secrets.ps1 -CommandLine "npm run providers:live"'
    )
  }
  safetyRules = @($manifest.rules)
}

foreach ($projectEntry in $manifest.projects.PSObject.Properties) {
  $project = $projectEntry.Value
  $plan.bitwardenProjects += [ordered]@{
    key = $projectEntry.Name
    name = $project.name
    machineAccount = $project.machineAccount
    access = "read-only"
    githubEnvironmentSecret = $project.githubEnvironmentSecret
    expectedSecretKeys = @($project.expectedSecretKeys)
  }
}

foreach ($environmentEntry in $manifest.githubEnvironments.PSObject.Properties) {
  $environment = $environmentEntry.Value
  $variables = @()
  foreach ($secretVariable in $environment.secretIdVariables.PSObject.Properties) {
    $variables += [ordered]@{
      environmentVariable = $secretVariable.Name
      githubVariable = [string]$secretVariable.Value
      value = "<Bitwarden secret id for $($secretVariable.Name)>"
    }
  }

  $plan.githubEnvironments += [ordered]@{
    key = $environmentEntry.Name
    name = $environment.name
    machineAccount = $environment.machineAccount
    bootstrapSecret = $environment.bootstrapSecret
    bootstrapSecretValue = "<machine-account-access-token>"
    secretIdVariables = $variables
    checks = @(
      "npm run providers:github:check",
      "npm run providers:github:remote-check"
    )
  }
}

if ($Json) {
  $plan | ConvertTo-Json -Depth 8
  exit 0
}

Write-Host "BWS setup plan"
Write-Host "Mode: $($plan.mode)"
Write-Host "Organization: $($plan.organization)"
Write-Host ""

Write-Host "1. Bitwarden Secrets Manager"
foreach ($project in $plan.bitwardenProjects) {
  Write-Host ("- Project: {0} ({1})" -f $project.name, $project.key)
  Write-Host ("  Machine account: {0} ({1})" -f $project.machineAccount, $project.access)
  if ($project.githubEnvironmentSecret) {
    Write-Host ("  GitHub bootstrap secret: {0}" -f $project.githubEnvironmentSecret)
  }
  Write-Host "  Secret keys:"
  foreach ($secretKey in $project.expectedSecretKeys) {
    Write-Host ("    - {0}" -f $secretKey)
  }
}

Write-Host ""
Write-Host "2. GitHub Environments"
foreach ($environment in $plan.githubEnvironments) {
  Write-Host ("- Environment: {0}" -f $environment.name)
  Write-Host ("  Environment secret: {0} = {1}" -f $environment.bootstrapSecret, $environment.bootstrapSecretValue)
  Write-Host "  Environment variables:"
  foreach ($variable in $environment.secretIdVariables) {
    Write-Host ("    - {0} = {1}" -f $variable.githubVariable, $variable.value)
  }
}

Write-Host ""
Write-Host "3. Local session"
foreach ($envVar in $plan.localSession.environmentVariables) {
  Write-Host ("- `$env:{0}" -f $envVar)
}

Write-Host ""
Write-Host "4. Checks"
foreach ($check in $plan.localSession.checks) {
  Write-Host ("- {0}" -f $check)
}
foreach ($environment in $plan.githubEnvironments) {
  foreach ($check in $environment.checks) {
    Write-Host ("- {0}" -f $check)
  }
}

Write-Host ""
Write-Host "Safety rules"
foreach ($rule in $plan.safetyRules) {
  Write-Host ("- {0}" -f $rule)
}
