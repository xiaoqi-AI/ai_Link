param(
  [string]$WikiRoot = "D:\llm-wiki"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$mirror = Join-Path $WikiRoot "wiki\projects\ai_Link"

function Ensure-Dir($path) {
  if (-not (Test-Path -LiteralPath $path)) {
    New-Item -ItemType Directory -Force -Path $path | Out-Null
  }
}

function Write-Utf8($path, $content) {
  [System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))
}

function Should-Skip($relativePath) {
  $normalized = $relativePath.Replace("\", "/")
  return (
    $normalized -like "runtime/private/*" -or
    $normalized -like ".git/*" -or
    $normalized -like "node_modules/*" -or
    $normalized -like "dist/*" -or
    $normalized -like "build/*" -or
    $normalized -like "*.log"
  )
}

if (-not (Test-Path -LiteralPath $WikiRoot)) {
  Write-Host "Knowledge base root does not exist: $WikiRoot"
  exit 1
}

Ensure-Dir $mirror

$includeRoots = @(
  "README.md",
  "AGENTS.md",
  ".gitignore",
  "CONTRIBUTING.md",
  "SECURITY.md",
  ".github",
  "docs",
  "tools"
)

$copied = @()
foreach ($item in $includeRoots) {
  $source = Join-Path $root $item
  if (-not (Test-Path -LiteralPath $source)) {
    continue
  }

  $sourceItem = Get-Item -LiteralPath $source
  if ($sourceItem.PSIsContainer) {
    $files = Get-ChildItem -LiteralPath $sourceItem.FullName -Recurse -File
  } else {
    $files = @($sourceItem)
  }

  foreach ($file in $files) {
    $relative = $file.FullName.Substring($root.Path.Length).TrimStart("\")
    if (Should-Skip $relative) {
      continue
    }
    $target = Join-Path $mirror $relative
    Ensure-Dir (Split-Path -Parent $target)
    Copy-Item -LiteralPath $file.FullName -Destination $target -Force
    $copied += $target
  }
}

$readmePath = Join-Path $mirror "README.md"
if (-not (Test-Path -LiteralPath $readmePath)) {
  Write-Utf8 $readmePath "# AI Link 知识库镜像`r`n`r`n这是 ai_Link 工作空间的知识库镜像。`r`n"
}

$manifestFiles = @()
foreach ($path in ($copied | Sort-Object -Unique)) {
  $file = Get-Item -LiteralPath $path
  $relative = $file.FullName.Substring($mirror.Length).TrimStart("\").Replace("\", "/")
  $manifestFiles += [ordered]@{
    path = $relative
    sha256 = (Get-FileHash -Algorithm SHA256 -Path $file.FullName).Hash.ToLowerInvariant()
    bytes = $file.Length
  }
}

$manifest = [ordered]@{
  generated_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
  project_id = "ai_Link"
  source_root = $root.Path
  mirror_root = $mirror
  files = $manifestFiles
}

Write-Utf8 (Join-Path $mirror "mirror-manifest.json") ($manifest | ConvertTo-Json -Depth 8)

Write-Host "Knowledge mirror synced: $mirror"
