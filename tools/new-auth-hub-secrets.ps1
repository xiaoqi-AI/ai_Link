param(
  [ValidateSet("env", "json")]
  [string]$Format = "env",
  [int]$Bytes = 32
)

$ErrorActionPreference = "Stop"

function New-Base64UrlSecret {
  param([int]$ByteCount)
  $bytes = New-Object byte[] $ByteCount
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
}

$secrets = [ordered]@{
  AI_LINK_APP_PASSWORD = New-Base64UrlSecret $Bytes
  AI_LINK_SESSION_SECRET = New-Base64UrlSecret $Bytes
  AI_LINK_ADMIN_TOKEN = New-Base64UrlSecret $Bytes
  AI_LINK_EXECUTOR_TOKEN = New-Base64UrlSecret $Bytes
  AI_LINK_CODEX_TOKEN = New-Base64UrlSecret $Bytes
}

if ($Format -eq "json") {
  $secrets | ConvertTo-Json -Depth 3
  exit 0
}

foreach ($entry in $secrets.GetEnumerator()) {
  Write-Output ("{0}={1}" -f $entry.Key, $entry.Value)
}

Write-Output ""
Write-Output "# Store these values in Render or Bitwarden Secrets Manager only."
Write-Output "# Do not paste them into Git, docs, issues, screenshots, or knowledge-base mirrors."
