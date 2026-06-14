param(
  [string]$OutputPath = "runtime/tmp/bws-acceptance-report.md",
  [string]$Repository = "xiaoqi-AI/ai_Link",
  [switch]$RunProviderLive,
  [switch]$Strict,
  [switch]$Force,
  [switch]$Print,
  [switch]$Help
)

$ErrorActionPreference = "Stop"

function Show-Help {
  Write-Host @"
BWS acceptance report

Usage:
  powershell -ExecutionPolicy Bypass -File tools/new-bws-acceptance-report.ps1 [-Strict] [-RunProviderLive]

Default:
  Writes a non-secret acceptance report to:

    runtime/tmp/bws-acceptance-report.md

Examples:
  npm run bws:acceptance
  npm run bws:acceptance:print
  npm run bws:acceptance:strict

Safety:
  - This command never prints secret values.
  - BWS_ACCESS_TOKEN, BW_ACCESS_TOKEN, GH_TOKEN, and GITHUB_TOKEN are reported
    only as present or missing.
  - Provider live verification is skipped unless -RunProviderLive is passed.
"@
}

function Fail($message) {
  Write-Error $message
  exit 1
}

function Resolve-RepoPath {
  param([string]$Path)
  if ([System.IO.Path]::IsPathRooted($Path)) {
    return [System.IO.Path]::GetFullPath($Path)
  }
  return [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Path))
}

function Test-RuntimeTmpTarget {
  param([string]$Path)
  $runtimeTmp = Resolve-RepoPath "runtime/tmp"
  $target = Resolve-RepoPath $Path
  $runtimePrefix = $runtimeTmp.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  return $target.StartsWith($runtimePrefix, [System.StringComparison]::OrdinalIgnoreCase)
}

function Resolve-NpmPath {
  $command = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $command) {
    $command = Get-Command npm -ErrorAction SilentlyContinue
  }
  if ($command) {
    return $command.Source
  }
  return $null
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

function Add-Check {
  param([string]$Name, [string]$Status, [string]$Detail)
  $script:checks.Add([ordered]@{
    name = $Name
    status = $Status
    detail = $Detail
  }) | Out-Null
}

function Invoke-Capture {
  param([scriptblock]$Command)
  $global:LASTEXITCODE = 0
  $output = ""
  try {
    $output = (& $Command 2>&1 | Out-String).Trim()
    $code = if ($null -ne $global:LASTEXITCODE) { [int]$global:LASTEXITCODE } else { 0 }
  } catch {
    $output = $_.Exception.Message
    $code = 1
  }

  return [ordered]@{
    code = $code
    output = $output
  }
}

function Invoke-Npm {
  param([string[]]$Arguments)
  & $script:npmPath @Arguments
}

function Invoke-Tool {
  param([string]$Name, [scriptblock]$Command, [string]$PassDetail, [string]$FailDetail = "")
  $result = Invoke-Capture $Command
  if ($result.code -eq 0) {
    Add-Check $Name "pass" $PassDetail
  } else {
    $detail = if ($FailDetail) { $FailDetail } else { "exit code $($result.code)" }
    Add-Check $Name "fail" $detail
  }
  return $result
}

function Escape-MarkdownCell {
  param([string]$Value)
  if ($null -eq $Value) {
    return ""
  }
  return $Value.Replace("|", "\|").Replace([string][char]0x60, "'")
}

function Test-BwsManifestConsistency {
  param([string]$ManifestPath = ".ai-link/bitwarden-secrets.manifest.json")

  $issues = @()
  if (-not (Test-Path -LiteralPath $ManifestPath)) {
    return @("Manifest not found: $ManifestPath")
  }

  try {
    $manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $ManifestPath | ConvertFrom-Json
  } catch {
    return @("Manifest could not be parsed.")
  }

  foreach ($environmentEntry in $manifest.githubEnvironments.PSObject.Properties) {
    $environment = $environmentEntry.Value
    $matchingProjects = @($manifest.projects.PSObject.Properties | Where-Object {
      $_.Value.machineAccount -eq $environment.machineAccount
    })

    if ($matchingProjects.Count -eq 0) {
      $issues += "GitHub environment '$($environmentEntry.Name)' has no project with machine account '$($environment.machineAccount)'."
      continue
    }

    foreach ($projectEntry in $matchingProjects) {
      $expectedKeys = @($projectEntry.Value.expectedSecretKeys)
      foreach ($secretVariable in $environment.secretIdVariables.PSObject.Properties) {
        if ($expectedKeys -notcontains $secretVariable.Name) {
          $issues += "Project '$($projectEntry.Name)' is missing expectedSecretKeys entry '$($secretVariable.Name)' used by GitHub environment '$($environmentEntry.Name)'."
        }
      }

      if ($projectEntry.Value.githubEnvironmentSecret -and $projectEntry.Value.githubEnvironmentSecret -ne $environment.bootstrapSecret) {
        $issues += "Project '$($projectEntry.Name)' uses GitHub bootstrap secret '$($projectEntry.Value.githubEnvironmentSecret)' but environment '$($environmentEntry.Name)' expects '$($environment.bootstrapSecret)'."
      }
    }
  }

  return $issues
}

if ($Help) {
  Show-Help
  exit 0
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not $Print -and -not (Test-RuntimeTmpTarget $OutputPath)) {
  Fail "Refusing to write BWS acceptance report outside runtime/tmp."
}

if (-not $Print -and (Test-Path -LiteralPath $OutputPath) -and -not $Force) {
  Fail "Output file already exists: $OutputPath. Pass -Force to overwrite."
}

$checks = New-Object System.Collections.Generic.List[object]
$npmPath = Resolve-NpmPath

if ($npmPath) {
  Add-Check "npm" "pass" "available"
} else {
  Add-Check "npm" "fail" "npm was not found"
}

$bwsPath = Resolve-BwsPath
if ($bwsPath) {
  $versionResult = Invoke-Capture { & $bwsPath --version }
  $version = if ($versionResult.output) { $versionResult.output } else { "available" }
  Add-Check "bws CLI" "pass" $version
} else {
  Add-Check "bws CLI" "pending" "install Bitwarden Secrets Manager CLI"
}

if ($env:AI_LINK_BWS_PROJECT_ID) {
  Add-Check "AI_LINK_BWS_PROJECT_ID" "pass" "present; value not printed"
} else {
  Add-Check "AI_LINK_BWS_PROJECT_ID" "pending" "set the non-sensitive local-dev Bitwarden project id"
}

if ($env:AI_LINK_BWS_CI_PROJECT_ID) {
  Add-Check "AI_LINK_BWS_CI_PROJECT_ID" "pass" "present; value not printed"
} else {
  Add-Check "AI_LINK_BWS_CI_PROJECT_ID" "pending" "set the non-sensitive CI Bitwarden project id"
}

if ($env:BWS_ACCESS_TOKEN) {
  Add-Check "BWS_ACCESS_TOKEN" "pass" "present in current session; value not printed"
} else {
  Add-Check "BWS_ACCESS_TOKEN" "pending" "set it only in the current local session"
}

if ($env:GH_TOKEN -or $env:GITHUB_TOKEN) {
  Add-Check "GitHub API token" "pass" "present in current session; value not printed"
} else {
  Add-Check "GitHub API token" "pending" "set GH_TOKEN or GITHUB_TOKEN only when checking remote GitHub Environment names"
}

$manifestIssues = @(Test-BwsManifestConsistency)
if ($manifestIssues.Count -eq 0) {
  Add-Check "BWS manifest consistency" "pass" "GitHub environment secret-id mappings match Bitwarden project expected keys"
} else {
  Add-Check "BWS manifest consistency" "fail" ($manifestIssues -join "; ")
}

if ($npmPath) {
  Invoke-Tool "TypeScript check" { Invoke-Npm @("run", "check") } "completed" | Out-Null
  Invoke-Tool "Config validation" { Invoke-Npm @("run", "ai-link", "--", "config", "validate") } "current merged config is valid" | Out-Null
  Invoke-Tool "Public sensitive-content scan" { Invoke-Npm @("run", "security:scan") } "no sensitive content found in scanned public files" | Out-Null
  Invoke-Tool "BWS setup plan" { Invoke-Npm @("run", "bws:plan") } "public BWS plan renders without secret values" | Out-Null
  Invoke-Tool "BWS onboarding runbook" { Invoke-Npm @("run", "bws:onboard:print") } "onboarding runbook renders without secret values" | Out-Null
  Invoke-Tool "BWS worksheet" { Invoke-Npm @("run", "bws:worksheet:print") } "worksheet renders without secret values" | Out-Null
  Invoke-Tool "BWS GitHub vars helper help" { Invoke-Npm @("run", "bws:github-vars:help") } "helper is available without real credentials" | Out-Null

  $policyDryRun = Invoke-Tool "External action policy dry-run" {
    Invoke-Npm @("run", "ai-link", "--", "run", "auto_ops.agent_flow", "--dry-run", "--input", "bws acceptance dry-run")
  } "dry-run reports approval state without executing external action"

  $policyBlock = Invoke-Capture {
    Invoke-Npm @("run", "ai-link", "--", "run", "auto_ops.agent_flow", "--input", "bws acceptance approval check")
  }
  if ($policyBlock.code -ne 0 -and $policyBlock.output -match "requires policy approval") {
    Add-Check "External action live guard" "pass" "live run is blocked until --approve-policy or workflow approval is explicit"
  } else {
    Add-Check "External action live guard" "fail" "expected a policy approval block before live external action"
  }
}

Invoke-Tool "GitHub provider-live local wiring" {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "check-github-provider-live.ps1") -Repository $Repository
} "workflow uses Bitwarden action, bootstrap secret, and secret-id variables" | Out-Null

if ($bwsPath -and $env:AI_LINK_BWS_PROJECT_ID -and $env:BWS_ACCESS_TOKEN) {
  Invoke-Tool "Local Bitwarden strict readiness" {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "check-bitwarden-secrets.ps1") -ProjectId $env:AI_LINK_BWS_PROJECT_ID -Strict
  } "local-dev project access and expected secret keys are ready" | Out-Null
} else {
  Add-Check "Local Bitwarden strict readiness" "pending" "requires bws CLI, AI_LINK_BWS_PROJECT_ID, and BWS_ACCESS_TOKEN"
}

if ($bwsPath -and $env:AI_LINK_BWS_CI_PROJECT_ID -and $env:BWS_ACCESS_TOKEN) {
  Invoke-Tool "BWS GitHub provider-live variable IDs" {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "export-bws-github-provider-vars.ps1") -ProjectId $env:AI_LINK_BWS_CI_PROJECT_ID -Print
  } "CI project contains provider secret IDs needed by GitHub Environment variables" | Out-Null
} else {
  Add-Check "BWS GitHub provider-live variable IDs" "pending" "requires bws CLI, AI_LINK_BWS_CI_PROJECT_ID, and BWS_ACCESS_TOKEN"
}

if ($env:GH_TOKEN -or $env:GITHUB_TOKEN) {
  Invoke-Tool "Remote GitHub provider-live Environment" {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "check-github-provider-live.ps1") -Repository $Repository -CheckRemote -Strict
  } "remote environment, bootstrap secret name, and variable names are present" | Out-Null
} else {
  Add-Check "Remote GitHub provider-live Environment" "pending" "requires GH_TOKEN or GITHUB_TOKEN with repository environment read access"
}

if ($RunProviderLive) {
  if ($bwsPath -and $env:AI_LINK_BWS_PROJECT_ID -and $env:BWS_ACCESS_TOKEN) {
    Invoke-Tool "Provider live verification with BWS injection" {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "with-bitwarden-secrets.ps1") -ProjectId $env:AI_LINK_BWS_PROJECT_ID -CommandLine "npm run providers:live"
    } "provider live verification completed through bws run" | Out-Null
  } else {
    Add-Check "Provider live verification with BWS injection" "pending" "requires bws CLI, local project id, and BWS_ACCESS_TOKEN"
  }
} else {
  Add-Check "Provider live verification with BWS injection" "skip" "pass -RunProviderLive only after confirming model cost boundaries"
}

$gitStatus = Invoke-Capture { & git status --short --branch --untracked-files=all }
if ($gitStatus.code -eq 0) {
  $statusLines = @($gitStatus.output -split "`r?`n" | Where-Object { $_ })
  $dirtyLines = @($statusLines | Where-Object { $_ -notmatch "^\#\# " })
  if ($dirtyLines.Count -eq 0) {
    Add-Check "Git working tree" "pass" "clean"
  } else {
    Add-Check "Git working tree" "warn" "$($dirtyLines.Count) pending change(s); review before commit or handoff"
  }
} else {
  Add-Check "Git working tree" "fail" "could not read git status"
}

$failed = @($checks | Where-Object { $_.status -eq "fail" })
$warnings = @($checks | Where-Object { $_.status -eq "warn" })
$pending = @($checks | Where-Object { $_.status -eq "pending" })
$skipped = @($checks | Where-Object { $_.status -eq "skip" })

$lines = New-Object System.Collections.Generic.List[string]
function Add-Line {
  param([string]$Line = "")
  $lines.Add($Line) | Out-Null
}

Add-Line "# BWS Acceptance Report"
Add-Line ""
Add-Line ("Generated: " + (Get-Date).ToString("yyyy-MM-dd HH:mm:ss zzz"))
Add-Line ""
Add-Line "Safety:"
Add-Line "- Secret values are never printed."
Add-Line "- Bootstrap tokens are reported only as present or missing."
Add-Line "- Provider live verification is skipped unless explicitly requested."
Add-Line ""
Add-Line "Summary:"
Add-Line "- Failed: $($failed.Count)"
Add-Line "- Warnings: $($warnings.Count)"
Add-Line "- Pending: $($pending.Count)"
Add-Line "- Skipped: $($skipped.Count)"
Add-Line "- Strict mode: $([bool]$Strict)"
Add-Line ""
Add-Line "| Check | Status | Detail |"
Add-Line "| --- | --- | --- |"
foreach ($check in $checks) {
  Add-Line ("| ``{0}`` | ``{1}`` | {2} |" -f (Escape-MarkdownCell $check.name), (Escape-MarkdownCell $check.status), (Escape-MarkdownCell $check.detail))
}

Add-Line ""
Add-Line "Recommended next actions:"
if ($failed.Count -gt 0) {
  Add-Line "- Fix failed checks before using BWS-backed live automation."
}
if ($pending.Count -gt 0) {
  Add-Line "- Complete pending Bitwarden/GitHub setup, then rerun ``npm run bws:acceptance:strict``."
}
if ($warnings.Count -gt 0) {
  Add-Line "- Review warnings before committing, pushing, or handing off to another machine."
}
if ($failed.Count -eq 0 -and $pending.Count -eq 0 -and $warnings.Count -eq 0) {
  Add-Line "- BWS mode is ready for normal dry-run and approved live workflows."
}
if (-not $RunProviderLive) {
  Add-Line "- Keep provider live verification disabled until model cost boundaries are confirmed."
}

$content = ($lines -join [Environment]::NewLine) + [Environment]::NewLine

if ($Print) {
  Write-Output $content
} else {
  $resolvedOutputPath = Resolve-RepoPath $OutputPath
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resolvedOutputPath) | Out-Null
  Set-Content -LiteralPath $resolvedOutputPath -Value $content -Encoding UTF8
  Write-Host "BWS acceptance report written to $OutputPath"
}

if ($failed.Count -gt 0 -or ($Strict -and ($warnings.Count -gt 0 -or $pending.Count -gt 0))) {
  exit 1
}
