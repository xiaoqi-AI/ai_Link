$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$required = @(
  "README.md",
  "AGENTS.md",
  ".gitignore",
  "CONTRIBUTING.md",
  "SECURITY.md",
  ".github/ISSUE_TEMPLATE/bug_report.md",
  ".github/ISSUE_TEMPLATE/feature_request.md",
  ".github/ISSUE_TEMPLATE/documentation_update.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  "docs/user-guide.md",
  "docs/00-governance/workspace-governance.md",
  "docs/00-governance/storage-sync-and-git-policy.md",
  "docs/00-governance/public-github-maintenance.md",
  "docs/00-governance/user-guidance-policy.md",
  "docs/00-governance/session-closeout-checklist.md",
  "docs/00-governance/open-questions.md",
  "docs/project-ledger/README.md",
  "docs/project-ledger/sessions/2026-06-14-initialization.md",
  "docs/project-ledger/sessions/2026-06-14-public-github-maintenance.md",
  "docs/90-templates/session-summary.md",
  "docs/90-templates/decision-record.md",
  "tools/check-governance.ps1",
  "tools/sync-knowledge-mirror.ps1",
  "tools/verify-knowledge-mirror.ps1",
  "tools/run-closeout.ps1"
)

$missing = @()
foreach ($item in $required) {
  $path = Join-Path $root $item
  if (-not (Test-Path -LiteralPath $path)) {
    $missing += $item
  }
}

if ($missing.Count -gt 0) {
  Write-Host "Governance check failed. Missing files:"
  $missing | ForEach-Object { Write-Host " - $_" }
  exit 1
}

$wikiRoot = "D:\llm-wiki"
if (Test-Path -LiteralPath $wikiRoot) {
  Write-Host "Knowledge base root: present"
} else {
  Write-Host "Knowledge base root: missing"
}

$mirror = Join-Path $wikiRoot "wiki\projects\ai_Link"
if (Test-Path -LiteralPath $mirror) {
  Write-Host "Knowledge mirror: present"
} else {
  Write-Host "Knowledge mirror: not present yet"
}

Write-Host "Governance check passed."
