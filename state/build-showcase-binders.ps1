# Creates the two layout-showcase binders on the @michimaker account.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\state\build-showcase-binders.ps1"
#
# Loads the michi service key from tcgscan.secrets into the environment and never prints it.
# Safe to re-run: a binder of the same title on that account is replaced, not duplicated.

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$secrets = 'C:\Users\Brian\source\repos\tcgscan\tcgscan.secrets'

Write-Host 'Showcase binders -> @michimaker'
Write-Host '--------------------------------'

if (-not (Test-Path $secrets)) {
  Write-Host "FAILED: secrets file not found at $secrets"
  exit 2
}

# Read the key quietly. Nothing is echoed, and it lives only in this process.
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

$payload = Join-Path $repo 'src\data\showcaseBinders.json'
if (-not (Test-Path $payload)) {
  Write-Host "FAILED: $payload is missing (regenerate it, or ask Claude to)"
  exit 4
}
$size = [math]::Round((Get-Item $payload).Length / 1KB)
Write-Host "Step 0: payload found ($size KB)"

Push-Location $repo
try {
  node "$PSScriptRoot\build-showcase-binders.mjs"
  $code = $LASTEXITCODE
}
finally {
  Pop-Location
  # Do not leave the key sitting in the session's environment.
  Remove-Item Env:\MICHI_SERVICE_KEY -ErrorAction SilentlyContinue
}

if ($code -ne 0) {
  Write-Host "FAILED: the build script exited with code $code"
  exit $code
}
Write-Host ''
Write-Host 'OK. Open the links above to check them.'
