# Applies supabase/migrations/20261014120000_entitlement_cancelled_at.sql to the live app project,
# then deploys the two webhooks that write the new column.
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\state\apply-entitlement-cancelled-at.ps1"
# Loads SUPABASE_ACCESS_TOKEN from analytics-studio\.env into the environment and never prints it.
# Safe to re-run: the column is add-if-not-exists and a redeploy is idempotent.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$ref = 'piikwvntldytjejxmcla'
$envFile = 'C:\Users\Brian\source\repos\analytics-studio\.env'
if (-not (Test-Path $envFile)) { Write-Host "FAILED: $envFile not found"; exit 2 }
$token = $null
foreach ($line in Get-Content $envFile) { if ($line -match '^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+)$') { $token = $Matches[1].Trim().Trim('"') } }
if ([string]::IsNullOrWhiteSpace($token)) { Write-Host 'FAILED: SUPABASE_ACCESS_TOKEN is missing from that .env'; exit 3 }
$env:SUPABASE_ACCESS_TOKEN = $token
Write-Host 'Step 0: management token loaded'

Push-Location $repo
try {
  Write-Host ''
  Write-Host 'PART 1 of 2: apply and verify the migration'
  node "$repo\scripts\apply-entitlement-cancelled-at.mjs"
  $code = $LASTEXITCODE
  if ($code -ne 0) { Write-Host "FAILED: migration step exited $code. Webhooks NOT deployed."; exit $code }
  Write-Host 'PART 1 done.'

  Write-Host ''
  Write-Host 'PART 2 of 2: deploy payments-webhook and revenuecat-webhook'
  & npx --yes supabase functions deploy payments-webhook revenuecat-webhook --project-ref $ref
  $code = $LASTEXITCODE
  if ($code -ne 0) { Write-Host "FAILED: functions deploy exited $code."; exit $code }
  Write-Host 'PART 2 done.'
}
finally { Pop-Location; Remove-Item Env:\SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue }

Write-Host ''
Write-Host 'ALL DONE. The next Stripe or RevenueCat event stamps cancelled_at.'
exit 0
