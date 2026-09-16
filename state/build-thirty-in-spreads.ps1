# Creates the "Thirty, In Spreads" binder under @fakemichi (private, editable).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\state\build-thirty-in-spreads.ps1"
#
# Loads the michi service key from tcgscan.secrets into the environment and never prints it.
# Safe to re-run: a binder of the same title on that account is replaced, not duplicated.

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$secrets = 'C:\Users\Brian\source\repos\tcgscan\tcgscan.secrets'

Write-Host 'Thirty, In Spreads -> @fakemichi'
Write-Host '---------------------------------'

if (-not (Test-Path $secrets)) {
  Write-Host "FAILED: secrets file not found at $secrets"
  exit 2
}

$key = $null
foreach ($line in Get-Content $secrets) {
  if ($line -match '^\s*APP_SECRET_KEY\s*=\s*(.+)$') { $key = $Matches[1].Trim() }
}
if ([string]::IsNullOrWhiteSpace($key)) {
  Write-Host 'FAILED: APP_SECRET_KEY is missing from tcgscan.secrets'
  exit 3
}
$env:MICHI_SERVICE_KEY = $key
Write-Host 'Step 0: service key loaded'

$payload = Join-Path $PSScriptRoot 'thirty-in-spreads.json'
if (-not (Test-Path $payload)) {
  Write-Host "FAILED: $payload is missing (ask Claude to regenerate it)"
  exit 4
}

Push-Location $repo
try {
  node "$PSScriptRoot\build-thirty-in-spreads.mjs"
  $code = $LASTEXITCODE
}
finally {
  Pop-Location
  Remove-Item Env:\MICHI_SERVICE_KEY -ErrorAction SilentlyContinue
}

if ($code -ne 0) {
  Write-Host "FAILED: the build script exited with code $code"
  exit $code
}
Write-Host ''
Write-Host 'OK. Open the link above, signed in as @fakemichi, and press Edit.'
