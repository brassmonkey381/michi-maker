# Applies supabase/migrations/20260923120000_atomic_slot_moves.sql to the live app project.
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\state\apply-atomic-slot-moves.ps1"
# Loads SUPABASE_ACCESS_TOKEN from analytics-studio\.env into the environment and never prints it.
# Safe to re-run: every function is create-or-replace and the grants are idempotent.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$envFile = 'C:\Users\Brian\source\repos\analytics-studio\.env'
if (-not (Test-Path $envFile)) { Write-Host "FAILED: $envFile not found"; exit 2 }
$token = $null
foreach ($line in Get-Content $envFile) { if ($line -match '^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+)$') { $token = $Matches[1].Trim().Trim('"') } }
if ([string]::IsNullOrWhiteSpace($token)) { Write-Host 'FAILED: SUPABASE_ACCESS_TOKEN is missing from that .env'; exit 3 }
$env:SUPABASE_ACCESS_TOKEN = $token
Write-Host 'Step 0: management token loaded'
Push-Location $repo
try { node "$repo\scripts\apply-atomic-slot-moves.mjs"; $code = $LASTEXITCODE }
finally { Pop-Location; Remove-Item Env:\SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue }
if ($code -ne 0) { Write-Host "FAILED: exit code $code"; exit $code }
