# apply-share-key.ps1 - the shared link's ?v= becomes a fingerprint instead of an edit counter.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<this file>"
#
# WHAT IT DOES. Applies supabase/migrations/20260826170000_share_key.sql, then proves the result on
# a probe binder it deletes afterwards: every binder has a key, no key disagrees with its own row,
# and an edit, a featured-page change and a CARD edit each change it.
#
# ORDER DOES NOT MATTER against the deploy, deliberately. The migration only ADDS a column and
# leaves share_version in place, so the currently deployed code keeps working whether this runs
# before or after `deploy-web.ps1`. Dropping the old column now would have broken every shared
# binder's unfurl for the length of the deploy, which is why a follow-up migration does that later.
#
# Safe to re-run: idempotent DDL, and the backfill only fills nulls.
#
# The token is read from the workspace secrets file into memory and is never printed.

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $MyInvocation.MyCommand.Definition
$SecretsFile = 'C:\Users\Brian\source\repos\tcgscan\tcgscan.secrets'

function Fail($step, $msg, $code) {
  Write-Host ""
  Write-Host "FAILED at [$step]: $msg (exit $code)" -ForegroundColor Red
  exit $code
}

Write-Host ""
Write-Host "[1] Loading the management token (value not shown)" -ForegroundColor Cyan
if (-not (Test-Path $SecretsFile)) { Fail '1' "no secrets file at $SecretsFile" 1 }
$token = $null
foreach ($line in Get-Content $SecretsFile) {
  if ($line -match '^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+?)\s*$') { $token = $Matches[1] }
}
if ([string]::IsNullOrWhiteSpace($token)) { Fail '1' 'SUPABASE_ACCESS_TOKEN not found in the secrets file' 1 }
$env:SUPABASE_ACCESS_TOKEN = $token
Write-Host "    ok"

Write-Host ""
Write-Host "[2] Applying and verifying" -ForegroundColor Cyan
Set-Location $Repo
& node (Join-Path $Repo 'scripts\apply-share-key.mjs')
$code = $LASTEXITCODE

# Never leave the token in this shell's environment.
$env:SUPABASE_ACCESS_TOKEN = $null

if ($code -ne 0) { Fail '2' 'the migration or one of its checks failed (see above)' $code }
Write-Host ""
Write-Host "DONE." -ForegroundColor Green
Write-Host "Existing links carrying the old integer v still resolve - nothing reads v." -ForegroundColor DarkGray
