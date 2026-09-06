# apply-slot-cell-deferrable.ps1 - swapping two pockets no longer trips "A change didn't save".
#
# Makes binder_slots' one-pocket-per-cell rule DEFERRABLE INITIALLY DEFERRED, so a single write
# that swaps two pockets (a cross-page swap in the double-page editor, or an undo of any swap) is
# judged on where the pockets end up rather than refused half way. Same rule, checked at commit.
#
# The applier reads the constraint, applies, proves it is now deferred, runs a swap-and-restore
# inside one transaction, confirms a genuine duplicate is still refused, and that no row changed.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File "C:\Users\Brian\source\repos\tcgscan\michi-maker\scripts\apply-slot-cell-deferrable.ps1"

$ErrorActionPreference = 'Stop'
$repo = Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..')
$secrets = Join-Path (Split-Path -Parent $repo) 'tcgscan.secrets'
$script = Join-Path $repo 'scripts\apply-slot-cell-deferrable.mjs'

Write-Host 'Step 0: loading secrets (silently)...'
if (-not (Test-Path $secrets)) { Write-Host "FAILED: $secrets not found"; exit 2 }
$token = $null
foreach ($line in Get-Content $secrets) {
  if ($line -match '^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+)\s*$') { $token = $Matches[1].Trim() }
}
if (-not $token) { Write-Host 'FAILED: SUPABASE_ACCESS_TOKEN not found in tcgscan.secrets'; exit 2 }
$env:SUPABASE_ACCESS_TOKEN = $token
Write-Host '  OK (token loaded, not shown)'

Write-Host 'Steps 1-5: applying (Node)...'
& node $script
$code = $LASTEXITCODE
$env:SUPABASE_ACCESS_TOKEN = $null
if ($code -ne 0) { Write-Host "FAILED: applier exited with code $code"; exit $code }
Write-Host 'Done: pocket swaps are judged at commit.'
