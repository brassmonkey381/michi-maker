# Fills card_image_urls on puzzles published before that column existed. REPORTS unless -Apply.
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\state\puzzle-backfill-images.ps1" -Apply
# Loads SUPABASE_ACCESS_TOKEN from analytics-studio\.env into the environment and never prints it.
param([switch] $Apply)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$envFile = 'C:\Users\Brian\source\repos\analytics-studio\.env'
if (-not (Test-Path $envFile)) { Write-Host "FAILED: $envFile not found"; exit 2 }
$token = $null
foreach ($line in Get-Content $envFile) { if ($line -match '^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+)$') { $token = $Matches[1].Trim().Trim('"') } }
if ([string]::IsNullOrWhiteSpace($token)) { Write-Host 'FAILED: SUPABASE_ACCESS_TOKEN is missing from that .env'; exit 3 }
$env:SUPABASE_ACCESS_TOKEN = $token
Write-Host 'Step 0: management token loaded'
$argsList = @()
if ($Apply) { $argsList += '--apply' }
Push-Location $repo
try { node "$repo\scripts\puzzles\backfill-card-images.mjs" @argsList; $code = $LASTEXITCODE }
finally { Pop-Location; Remove-Item Env:\SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue }
if ($code -ne 0) { Write-Host "FAILED: exit code $code"; exit $code }
