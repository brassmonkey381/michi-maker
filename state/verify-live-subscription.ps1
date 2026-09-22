# Proves the LIVE Stripe subscription path end to end against the test account.
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\state\verify-live-subscription.ps1"
#   ...same, with -Mode cancel -Yes      ends the test subscription immediately (the revocation test)
#   ...same, with -Mode refund -Yes      refunds the charge in full
# Loads STRIPE_SECRET_KEY, SUPABASE_ACCESS_TOKEN and MICHI_TEST_EMAIL from their files into the
# environment and never prints them. Default mode is check, which is read-only and safe to re-run.
param(
  [ValidateSet('check', 'cancel', 'refund')] [string] $Mode = 'check',
  [switch] $Yes
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot

$secrets = 'C:\Users\Brian\source\repos\tcgscan\tcgscan.secrets'
$envFile = 'C:\Users\Brian\source\repos\analytics-studio\.env'
if (-not (Test-Path $secrets)) { Write-Host "FAILED: $secrets not found"; exit 2 }
if (-not (Test-Path $envFile)) { Write-Host "FAILED: $envFile not found"; exit 2 }

$stripeKey = $null; $testEmail = $null; $token = $null
foreach ($line in Get-Content $secrets) {
  if ($line -match '^\s*STRIPE_SECRET_KEY\s*=\s*(.+)$') { $stripeKey = $Matches[1].Trim().Trim('"') }
  if ($line -match '^\s*MICHI_TEST_EMAIL\s*=\s*(.+)$')  { $testEmail = $Matches[1].Trim().Trim('"') }
}
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+)$') { $token = $Matches[1].Trim().Trim('"') }
}
if ([string]::IsNullOrWhiteSpace($stripeKey)) { Write-Host 'FAILED: STRIPE_SECRET_KEY is missing from the secrets file'; exit 3 }
if ([string]::IsNullOrWhiteSpace($testEmail)) { Write-Host 'FAILED: MICHI_TEST_EMAIL is missing from the secrets file'; exit 3 }
if ([string]::IsNullOrWhiteSpace($token))     { Write-Host 'FAILED: SUPABASE_ACCESS_TOKEN is missing from that .env'; exit 3 }

$env:STRIPE_SECRET_KEY = $stripeKey
$env:MICHI_TEST_EMAIL = $testEmail
$env:SUPABASE_ACCESS_TOKEN = $token
Write-Host "Step 0: credentials loaded, mode = $Mode"

$extra = @()
if ($Yes) { $extra += '--yes' }

Push-Location $repo
try { node "$repo\scripts\verify-live-subscription.mjs" $Mode @extra; $code = $LASTEXITCODE }
finally {
  Pop-Location
  Remove-Item Env:\STRIPE_SECRET_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:\MICHI_TEST_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:\SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
}
if ($code -ne 0) { Write-Host "FAILED: exit code $code"; exit $code }
