# READ-ONLY audit: how many of the 30th Celebration cards a binder holds, and which are missing.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\state\audit-thirty-in-spreads.ps1"
#
# Loads the michi service key from tcgscan.secrets into the environment and never prints it.
param([string]$BinderId = '0aac0c11-e0a0-4918-8b41-7bdf2e3fbdbe')
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$secrets = 'C:\Users\Brian\source\repos\tcgscan\tcgscan.secrets'
if (-not (Test-Path $secrets)) { Write-Host "FAILED: secrets file not found at $secrets"; exit 2 }
$key = $null
foreach ($line in Get-Content $secrets) { if ($line -match '^\s*APP_SECRET_KEY\s*=\s*(.+)$') { $key = $Matches[1].Trim() } }
if ([string]::IsNullOrWhiteSpace($key)) { Write-Host 'FAILED: APP_SECRET_KEY is missing from tcgscan.secrets'; exit 3 }
$env:MICHI_SERVICE_KEY = $key
Write-Host 'Step 0: service key loaded'
Push-Location $repo
try { node "$PSScriptRoot\audit-thirty-in-spreads.mjs" $BinderId; $code = $LASTEXITCODE }
finally { Pop-Location; Remove-Item Env:\MICHI_SERVICE_KEY -ErrorAction SilentlyContinue }
if ($code -ne 0) { Write-Host "FAILED: exit code $code"; exit $code }
