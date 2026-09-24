# Points every puzzle binder page at one backdrop image. CHECKS ONLY unless -Apply is passed.
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\state\puzzle-backdrop.ps1" -Url "https://..."
#   ...same, with -Apply          writes it
# Loads SUPABASE_ACCESS_TOKEN from analytics-studio\.env into the environment and never prints it.
param(
  [Parameter(Mandatory = $true)][string] $Url,
  [switch] $Apply
)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$envFile = 'C:\Users\Brian\source\repos\analytics-studio\.env'
if (-not (Test-Path $envFile)) { Write-Host "FAILED: $envFile not found"; exit 2 }
$token = $null
foreach ($line in Get-Content $envFile) { if ($line -match '^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+)$') { $token = $Matches[1].Trim().Trim('"') } }
if ([string]::IsNullOrWhiteSpace($token)) { Write-Host 'FAILED: SUPABASE_ACCESS_TOKEN is missing from that .env'; exit 3 }
$env:SUPABASE_ACCESS_TOKEN = $token
Write-Host 'Step 0: management token loaded'

$argsList = @($Url)
if ($Apply) { $argsList += '--apply' }

Push-Location $repo
try { node "$repo\scripts\puzzles\set-puzzle-backdrop.mjs" @argsList; $code = $LASTEXITCODE }
finally { Pop-Location; Remove-Item Env:\SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue }
if ($code -ne 0) { Write-Host "FAILED: exit code $code"; exit $code }
