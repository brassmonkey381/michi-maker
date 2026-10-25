$ErrorActionPreference = 'Stop'
$repo = 'C:\Users\Brian\source\repos\tcgscan\michi-maker'
$secrets = 'C:\Users\Brian\source\repos\tcgscan\tcgscan.secrets'
Write-Host 'Step 0: loading the Stripe key (silently)...'
$k = $null
foreach ($line in Get-Content $secrets) { if ($line -match '^\s*STRIPE_SECRET_KEY\s*=\s*(.+)\s*$') { $k = $Matches[1].Trim() } }
if (-not $k) { Write-Host 'FAILED: STRIPE_SECRET_KEY not found'; exit 2 }
$env:STRIPE_SECRET_KEY = $k
& node "$repo\scripts\stripe-owner-print-code.mjs" '689143c4-5d32-4905-991e-c894f9cf2620' 'MICHIOWNER'
$code = $LASTEXITCODE
$env:STRIPE_SECRET_KEY = $null
if ($code -ne 0) { Write-Host "FAILED: exit $code"; exit $code }
