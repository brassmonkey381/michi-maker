# apply-contest-stage2.ps1 - the binder contest's second stage (docs/CONTEST.md).
#
#   (no switch)   apply the stage-two schema; changes nothing visible until a field is frozen.
#   -Snapshot     freeze the stage-1 field into contest_finalists and lock those binders. RUN AT THE CUTOFF.
#   -Snapshot -Force   re-cut the field (clears the previous finalists AND any finals votes).
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\scripts\apply-contest-stage2.ps1" -Snapshot

param([switch]$Snapshot, [switch]$Force)

$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..')
$secrets = Join-Path (Split-Path -Parent $repo) 'tcgscan.secrets'
$script = Join-Path $repo 'scripts\apply-contest-stage2.mjs'

Write-Host 'Step 0: loading secrets (silently)...'
if (-not (Test-Path $secrets)) { Write-Host "FAILED: $secrets not found"; exit 2 }
$token = $null
foreach ($line in Get-Content $secrets) {
  if ($line -match '^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+)\s*$') { $token = $Matches[1].Trim() }
}
if (-not $token) { Write-Host 'FAILED: SUPABASE_ACCESS_TOKEN not found in tcgscan.secrets'; exit 2 }
$env:SUPABASE_ACCESS_TOKEN = $token
Write-Host '  OK (token loaded, not shown)'

$flags = @()
if ($Snapshot) { $flags += '--snapshot' }
if ($Force) { $flags += '--force' }
Write-Host "Running the stage-two script $(if ($Snapshot) { '(SNAPSHOT: this freezes and locks the field)' } else { '(schema only)' })..."
& node $script @flags
$code = $LASTEXITCODE
$env:SUPABASE_ACCESS_TOKEN = $null
if ($code -ne 0) { Write-Host "FAILED: script exited with code $code"; exit $code }
