<#
  The one-time binder PDF price: $1.99 (was $3.99). Moves the Stripe lookup key michi_binder_pdf
  onto a new one-time price on the same product.
  DRY RUN BY DEFAULT: it reads your Stripe account and prints what it WOULD do. Add -Apply to write.
  It says LIVE or TEST (from the key) before anything else. Past purchases are untouched.
  Loads STRIPE_SECRET_KEY from tcgscan.secrets silently; the value is never printed.
  Usage:
    powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\state\stripe-binder-pdf-price.ps1"
    powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\state\stripe-binder-pdf-price.ps1" -Apply
#>
param([switch]$Apply)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$secrets = Join-Path (Split-Path -Parent $repo) 'tcgscan.secrets'
Write-Host '[0/3] Loading STRIPE_SECRET_KEY from tcgscan.secrets (value not shown)...'
if (-not (Test-Path $secrets)) { Write-Host "FAILED: $secrets not found (exit code 2)"; exit 2 }
$k = $null
foreach ($line in Get-Content $secrets) {
  if ($line -match '^\s*STRIPE_SECRET_KEY\s*=\s*(.+)\s*$') { $k = $Matches[1].Trim().Trim('"') }
}
if (-not $k) { Write-Host 'FAILED: STRIPE_SECRET_KEY is not in tcgscan.secrets (exit code 2).'; exit 2 }
$env:STRIPE_SECRET_KEY = $k
if ($Apply) { $env:APPLY = '1' } else { $env:APPLY = '0' }
Write-Host '      OK'
try { & node (Join-Path $repo 'scripts\stripe-binder-pdf-price.mjs'); $code = $LASTEXITCODE }
finally { Remove-Item Env:\STRIPE_SECRET_KEY -ErrorAction SilentlyContinue; Remove-Item Env:\APPLY -ErrorAction SilentlyContinue }
if ($code -ne 0) { Write-Host "FAILED: the script exited $code"; exit $code }
