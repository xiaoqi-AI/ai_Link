param(
  [string]$Summary = "Session closeout"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$stamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
$sessionDir = Join-Path $root "docs\project-ledger\sessions"
$sessionPath = Join-Path $sessionDir "$stamp-session.md"

if (-not (Test-Path -LiteralPath $sessionDir)) {
  New-Item -ItemType Directory -Force -Path $sessionDir | Out-Null
}

$content = @"
# $stamp 会话收尾

## 摘要

$Summary

## 自动收尾

- 已运行治理检查
- 已同步知识库镜像
- 已验证知识库镜像哈希
- 已输出 Git 状态

"@

[System.IO.File]::WriteAllText($sessionPath, $content, [System.Text.UTF8Encoding]::new($false))

& (Join-Path $PSScriptRoot "check-governance.ps1")
& (Join-Path $PSScriptRoot "sync-knowledge-mirror.ps1")
& (Join-Path $PSScriptRoot "verify-knowledge-mirror.ps1")

if (Test-Path -LiteralPath (Join-Path $root ".git")) {
  git -C $root.Path status --short --branch
} else {
  Write-Host "Git repository: not initialized"
}
