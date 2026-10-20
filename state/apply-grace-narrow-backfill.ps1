# Brings the ONE live row the old grace produced in line with the narrowed rule (5f0ae7e):
# a Stripe subscription in dunning on its first term after a trial, never paid, currently
# expires_at = period_start + 3 days. Sets expires_at = period_start (where the trial ended).
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\state\apply-grace-narrow-backfill.ps1"
# Loads SUPABASE_ACCESS_TOKEN from analytics-studio\.env and never prints it. Re-runnable.
# A paying customer in dunning on a renewal has no trial row ending at period_start and is untouched.
$ErrorActionPreference = 'Stop'
$ref = 'piikwvntldytjejxmcla'
$envFile = 'C:\Users\Brian\source\repos\analytics-studio\.env'
if (-not (Test-Path $envFile)) { Write-Host "FAILED: $envFile not found"; exit 2 }
$token = $null
foreach ($line in Get-Content $envFile) { if ($line -match '^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+)$') { $token = $Matches[1].Trim().Trim('"') } }
if ([string]::IsNullOrWhiteSpace($token)) { Write-Host 'FAILED: SUPABASE_ACCESS_TOKEN is missing from that .env'; exit 3 }
Write-Host 'Step 0: management token loaded'

$where = @"
  e.source = 'stripe' and e."interval" is not null and e.cancelled_at is null
  and e.period_start is not null
  and e.expires_at = e.period_start + interval '3 days'
  and exists (select 1 from public.pro_trials t where t.user_id = e.user_id and t.expires_at = e.period_start)
"@

function Invoke-Sql([string]$query) {
  $body = @{ query = $query } | ConvertTo-Json -Compress
  $headers = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }
  return Invoke-RestMethod -Method Post -Uri "https://api.supabase.com/v1/projects/$ref/database/query" -Headers $headers -Body $body
}

try {
  Write-Host 'Step 1: rows in dunning on a never-paid first term'
  $before = @(Invoke-Sql "select left(e.user_id::text, 8) as who, e.product, e.period_start, e.expires_at from public.entitlements e where $where;")
  foreach ($r in $before) { Write-Host "  $($r.who) $($r.product): expires $($r.expires_at) -> $($r.period_start)" }
  Write-Host "  $($before.Count) row(s)"

  Write-Host 'Step 2: set expires_at to where the trial ended'
  $done = @(Invoke-Sql "update public.entitlements e set expires_at = e.period_start where $where returning e.user_id;")
  Write-Host "  $($done.Count) row(s) updated"

  Write-Host 'Step 3: verify'
  $after = @(Invoke-Sql "select count(*)::int as n from public.entitlements e where $where;")
  if ($after[0].n -ne 0) { Write-Host "FAILED: $($after[0].n) row(s) still carry the old grace"; exit 4 }
  Write-Host 'OK: a failed first charge no longer buys three extra days. A Stripe retry that succeeds restores the full term via invoice.paid.'
}
catch {
  Write-Host "FAILED: $($_.Exception.Message)"
  exit 5
}
exit 0
