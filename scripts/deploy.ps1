<#
.SYNOPSIS
  Uploads everything in public/ to the cPanel host over FTP(S).

.DESCRIPTION
  Manual fallback for the GitHub Actions deploy. Reads credentials from
  .env.deploy in the repo root (copy .env.deploy.example). Overwrites files
  on the server; it never deletes anything there.

.EXAMPLE
  ./scripts/deploy.ps1
  ./scripts/deploy.ps1 -DryRun
#>
param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$repoRoot  = Split-Path -Parent $PSScriptRoot
$publicDir = Join-Path $repoRoot 'public'
$envFile   = Join-Path $repoRoot '.env.deploy'

if (-not (Test-Path $envFile)) {
  throw "Missing $envFile. Copy .env.deploy.example to .env.deploy and fill it in."
}

# Parse KEY=VALUE lines, ignoring comments and blanks
$cfg = @{}
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*)\s*$') { $cfg[$Matches[1]] = $Matches[2] }
}
foreach ($key in 'FTP_SERVER', 'FTP_USERNAME', 'FTP_PASSWORD') {
  if (-not $cfg[$key]) { throw "$key is not set in .env.deploy" }
}

$remoteDir = ($cfg['FTP_REMOTE_DIR'] -replace '\\', '/').Trim('/')
$secure    = $cfg['FTP_SECURE'] -ne 'false'
$cred      = New-Object System.Net.NetworkCredential($cfg['FTP_USERNAME'], $cfg['FTP_PASSWORD'])
$baseUri   = "ftp://$($cfg['FTP_SERVER'])/" + $(if ($remoteDir) { "$remoteDir/" } else { '' })

function New-FtpRequest([string]$uri, [string]$method) {
  $req = [System.Net.FtpWebRequest]::Create($uri)
  $req.Method      = $method
  $req.Credentials = $cred
  $req.EnableSsl   = $secure
  $req.UseBinary   = $true
  $req.UsePassive  = $true
  $req.KeepAlive   = $true
  return $req
}

$madeDirs = @{}
function Ensure-RemoteDir([string]$relDir) {
  if (-not $relDir -or $madeDirs[$relDir]) { return }
  $parent = Split-Path $relDir -Parent
  if ($parent) { Ensure-RemoteDir ($parent -replace '\\', '/') }
  try {
    (New-FtpRequest ($baseUri + $relDir) ([System.Net.WebRequestMethods+Ftp]::MakeDirectory)).GetResponse().Close()
  } catch {
    # Directory most likely exists already
  }
  $madeDirs[$relDir] = $true
}

$files = Get-ChildItem $publicDir -Recurse -File -Force
Write-Host "Deploying $($files.Count) files to $baseUri (FTPS: $secure)" -ForegroundColor Cyan

foreach ($file in $files) {
  $rel = $file.FullName.Substring($publicDir.Length + 1) -replace '\\', '/'
  if ($DryRun) { Write-Host "  would upload $rel"; continue }

  Ensure-RemoteDir ((Split-Path $rel -Parent) -replace '\\', '/')

  $req   = New-FtpRequest ($baseUri + $rel) ([System.Net.WebRequestMethods+Ftp]::UploadFile)
  $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
  $req.ContentLength = $bytes.Length
  $stream = $req.GetRequestStream()
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Close()
  $req.GetResponse().Close()
  Write-Host "  uploaded $rel"
}

Write-Host 'Done.' -ForegroundColor Green
