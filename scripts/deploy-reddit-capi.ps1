# Deploys the reddit-capi edge function and sets its secrets on the APP project
# (piikwvntldytjejxmcla), each call pinned to that project ref. Run from any terminal:
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\scripts\deploy-reddit-capi.ps1"
#
# The Conversions API access token is read from C:\Users\Brian\source\repos\tcgscan\tcgscan.secrets
# (a line `REDDIT_CAPI_TOKEN=...`, which the owner adds himself) or from the REDDIT_CAPI_TOKEN env
# var; the pixel id from REDDIT_PIXEL_ID in the same two places, falling back to
# EXPO_PUBLIC_REDDIT_PIXEL_ID in michi-maker\.env.production or .env. Values are never printed.
# Optional in the secrets file: REDDIT_CAPI_HASH_EMAIL=1, REDDIT_CAPI_TEST_MODE=1.
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$secrets = Join-Path (Split-Path -Parent $repo) 'tcgscan.secrets'

function Read-KeyFile([string]$path, [string]$key) {
  if (-not (Test-Path $path)) { return $null }
  foreach ($line in Get-Content $path) {
    if ($line -match "^\s*$key\s*=\s*(.+?)\s*$") { return $Matches[1].Trim('"').Trim("'") }
  }
  return $null
}

Write-Host "[1/4] Loading secrets (values are not shown)"
$token = $env:REDDIT_CAPI_TOKEN
if (-not $token) { $token = Read-KeyFile $secrets 'REDDIT_CAPI_TOKEN' }
if (-not $token) { Write-Host "FAILED: no REDDIT_CAPI_TOKEN in the env or in $secrets"; exit 2 }
$pixel = $env:REDDIT_PIXEL_ID
if (-not $pixel) { $pixel = Read-KeyFile $secrets 'REDDIT_PIXEL_ID' }
if (-not $pixel) { $pixel = Read-KeyFile (Join-Path $repo '.env.production') 'EXPO_PUBLIC_REDDIT_PIXEL_ID' }
if (-not $pixel) { $pixel = Read-KeyFile (Join-Path $repo '.env') 'EXPO_PUBLIC_REDDIT_PIXEL_ID' }
if (-not $pixel) { Write-Host "FAILED: no REDDIT_PIXEL_ID (or EXPO_PUBLIC_REDDIT_PIXEL_ID) found"; exit 2 }
$hashEmail = Read-KeyFile $secrets 'REDDIT_CAPI_HASH_EMAIL'
$testMode = Read-KeyFile $secrets 'REDDIT_CAPI_TEST_MODE'
Write-Host "      token: present, pixel id: present, hash email: $(if ($hashEmail -eq '1') { 'on' } else { 'off' }), test mode: $(if ($testMode -eq '1') { 'on' } else { 'off' })"

Write-Host "[2/4] Creating the reddit_conversions table (the one SQL file, not db push)"
# NOT `db push`: the app project is shared with the tcgscan repos, whose migration history lives in
# the remote table and not in this repo, so push stops on ~50 remote versions it cannot see
# (analytics-studio, 2026-10-30). The file is `create table if not exists`, so a rerun is safe.
$sql = Join-Path $repo 'supabase\migrations\20261030160000_reddit_conversions.sql'
Push-Location $repo
try {
  & npx supabase db query --linked --project-ref piikwvntldytjejxmcla -f $sql
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: supabase db query exited $LASTEXITCODE. Paste $sql into the SQL editor instead, then rerun this script."; exit 3 }

  Write-Host "[3/4] Setting function secrets"
  # Not `$args`: that is PowerShell's automatic variable for unbound arguments, and splatting it
  # handed the CLI an empty list ("No arguments found", 2026-10-30).
  $secretArgs = @("REDDIT_CAPI_TOKEN=$token", "REDDIT_PIXEL_ID=$pixel", "REDDIT_CAPI_HASH_EMAIL=$(if ($hashEmail -eq '1') { '1' } else { '0' })", "REDDIT_CAPI_TEST_MODE=$(if ($testMode -eq '1') { '1' } else { '0' })")
  & npx supabase secrets set --project-ref piikwvntldytjejxmcla @secretArgs
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: supabase secrets set exited $LASTEXITCODE"; exit 4 }

  Write-Host "[4/4] Deploying reddit-capi (verify_jwt stays on)"
  & npx supabase functions deploy reddit-capi --project-ref piikwvntldytjejxmcla
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: functions deploy exited $LASTEXITCODE"; exit 5 }
} finally {
  Pop-Location
}
Write-Host "DONE: reddit-capi is live. Next sign-up logs 'reddit-capi uid=... status=...' in the function logs."
