# diagnose-binder-writes.ps1 - why is a binder save being refused?
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<this file>"
#
# Reproduces the app's own writes against the live database AS A REAL SIGNED-IN USER (role
# authenticated, a genuine uid in request.jwt.claims), so RLS and every trigger apply exactly as
# they do in the browser, and prints whatever each one raises. Insert a binder, insert a page,
# insert a slot, update the page, delete the slot, delete the binder.
#
# READ-ONLY IN EFFECT. The probe runs inside a DO block that ends in RAISE EXCEPTION, so the
# transaction rolls back and the report arrives as the error message. Nothing is left behind.
#
# It also lists every trigger on binders / binder_pages / binder_slots and says whether the
# contest edit-lock guard is the broken version, so "is it the contest lock?" is answered by the
# database rather than by argument.
#
# No secrets are printed.

$ErrorActionPreference = 'Stop'
$Repo = Split-Path -Parent $MyInvocation.MyCommand.Definition
$SecretsFile = 'C:\Users\Brian\source\repos\tcgscan\tcgscan.secrets'

function Fail($step, $msg, $code) {
  Write-Host ""
  Write-Host "FAILED at [$step]: $msg (exit $code)" -ForegroundColor Red
  exit $code
}

Write-Host ""
Write-Host "Diagnosing binder writes" -ForegroundColor Cyan

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
Write-Host "[2] Probing" -ForegroundColor Cyan
Set-Location $Repo
& node (Join-Path $Repo 'scripts\diagnose-binder-writes.mjs')
$code = $LASTEXITCODE

$env:SUPABASE_ACCESS_TOKEN = $null

if ($code -ne 0) { Fail '2' 'the diagnostic could not run (see above)' $code }
Write-Host ""
Write-Host "DONE. Nothing was written." -ForegroundColor Green
