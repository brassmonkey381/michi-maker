# stripe-pro-price-2026-10.ps1 - michi-maker PRO becomes $2.99 a month and $24.99 a year.
#
# Dry run by default: prints what would change. -Apply writes it. Loads STRIPE_SECRET_KEY from
# tcgscan.secrets silently; the script prints whether that key is LIVE or TEST before acting.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\scripts\stripe-pro-price-2026-10.ps1"
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\scripts\stripe-pro-price-2026-10.ps1" -Apply

param([switch]$Apply)

$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..')
$secrets = Join-Path (Split-Path -Parent $repo) 'tcgscan.secrets'
$script = Join-Path $repo 'scripts\stripe-pro-price-2026-10.mjs'

Write-Host 'Step 0: loading secrets (silently)...'
if (-not (Test-Path $secrets)) { Write-Host "FAILED: $secrets not found"; exit 2 }
$key = $null
foreach ($line in Get-Content $secrets) {
  if ($line -match '^\s*STRIPE_SECRET_KEY\s*=\s*(.+)\s*$') { $key = $Matches[1].Trim() }
}
if (-not $key) { Write-Host 'FAILED: STRIPE_SECRET_KEY not found in tcgscan.secrets'; exit 2 }
$env:STRIPE_SECRET_KEY = $key
if ($Apply) { $env:APPLY = '1' } else { $env:APPLY = '0' }
Write-Host '  OK (key loaded, not shown)'

& node $script
$code = $LASTEXITCODE
$env:STRIPE_SECRET_KEY = $null
$env:APPLY = $null
if ($code -ne 0) { Write-Host "FAILED: script exited with code $code"; exit $code }
